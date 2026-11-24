import type { ExecutionItem, ExecutionManifest, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { cloneManifest } from "../graph/manifest-walk.js"
import type { StructureEditResult } from "../graph/structure-edit.js"
import { validationFromIssues } from "./document-state.js"
import type { AppValidation } from "./results.js"
import { createTextScheduler, textSchedulerDiscard, textSchedulerPending, type TextSchedulerState } from "./text-scheduler.js"

/** Maximum undo snapshots kept for the session. */
export const UNDO_CAP = 100

/** Save indicator state for the workspace header. */
export type SaveStatus = "saved" | "saving" | "error"

/**
 * One queued manifest change waiting for commit acknowledgement.
 * @category App
 */
export type PendingEntry =
  | {
      kind: "edit"
      label: string
      /** Re-apply on conflict replay. */
      apply: (manifest: ExecutionManifest) => StructureEditResult
      scripts?: Record<string, string>
    }
  | {
      kind: "restore"
      label: "Undo" | "Redo"
      manifest: ExecutionManifest
      scripts?: Record<string, string>
    }

/**
 * Undo/redo snapshot.
 * @category App
 */
export interface HistorySnapshot {
  manifest: ExecutionManifest
  scripts?: Record<string, string>
}

/**
 * Pure edit-session state (working copy, queue, history).
 * @category App
 */
export interface EditSessionState {
  local: ExecutionManifest
  version: number | string
  pending: PendingEntry[]
  /** Count of `pending` entries included in the in-flight commit. */
  inFlightCount: number
  ownVersions: (number | string)[]
  undo: HistorySnapshot[]
  redo: HistorySnapshot[]
  status: SaveStatus
  statusError?: string
  structureError?: string
  versionConflictNote?: string
  draftDiscardNote?: string
  /** Bumps on external reload or field identity change. */
  fieldEpoch: number
  /** Bumps on external reload (script refetch). */
  externalEpoch: number
  validation: AppValidation
  textScheduler: TextSchedulerState
  /** Monotonic id for each retrieve started. */
  retrieveGeneration: number
  /** Set when a commit acknowledgement arrives (marks older retrieves stale). */
  commitAckGeneration: number
  /** Generation captured at the start of the in-flight retrieve, if any. */
  pendingRetrieveGeneration: number
}

/**
 * Result of classifying a retrieve against the session.
 * @category App
 */
export type RetrieveClassification =
  | { kind: "own-echo" }
  | { kind: "stale" }
  | { kind: "deferred" }
  | { kind: "external" }
  | { kind: "initial" }

/**
 * Arguments for {@link createEditSession}.
 * @category App
 */
export interface CreateEditSessionInput {
  manifest: ExecutionManifest
  version: number | string
  issues: readonly ValidationIssue[]
}

/**
 * Start an edit session from a loaded execution.
 * @category App
 */
export function createEditSession(input: CreateEditSessionInput): EditSessionState {
  return {
    local: input.manifest,
    version: input.version,
    pending: [],
    inFlightCount: 0,
    ownVersions: [],
    undo: [],
    redo: [],
    status: "saved",
    fieldEpoch: 0,
    externalEpoch: 0,
    validation: validationFromIssues(input.issues),
    textScheduler: createTextScheduler(),
    retrieveGeneration: 0,
    commitAckGeneration: 0,
    pendingRetrieveGeneration: 0,
  }
}

/**
 * Build the named-discard version-conflict banner.
 * @category App
 */
export function formatVersionConflictNote(labels: readonly string[]): string {
  return `This execution changed elsewhere. Reloaded the latest version; discarded: ${labels.join(", ")}.`
}

export const DRAFT_DISCARD_NOTE = "External change reloaded the execution; unsaved edits were discarded."

function pushUndo(state: EditSessionState, snapshot: HistorySnapshot): EditSessionState {
  const undo = [...state.undo, snapshot]
  if (undo.length > UNDO_CAP) undo.shift()
  return { ...state, undo, redo: [] }
}

function mergeScripts(pending: readonly PendingEntry[], through: number): Record<string, string> | undefined {
  const merged: Record<string, string> = {}
  for (let index = 0; index < through; index += 1) {
    const entry = pending[index]
    if (entry && entry.kind === "edit" && entry.scripts) {
      Object.assign(merged, entry.scripts)
    }
    if (entry && entry.kind === "restore" && entry.scripts) {
      Object.assign(merged, entry.scripts)
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

/**
 * Scripts merged from the in-flight prefix of `pending`.
 * @category App
 */
export function scriptsForInFlight(state: EditSessionState): Record<string, string> | undefined {
  if (state.inFlightCount === 0) return undefined
  return mergeScripts(state.pending, state.inFlightCount)
}

/**
 * True when a commit may be sent.
 * @category App
 */
export function shouldPumpCommit(state: EditSessionState): boolean {
  return state.inFlightCount === 0 && state.pending.length > 0
}

/**
 * Mark the full pending queue as in flight (one commit of current `local`).
 * @category App
 */
export function beginInFlightCommit(state: EditSessionState): EditSessionState {
  if (state.pending.length === 0) return state
  return {
    ...state,
    inFlightCount: state.pending.length,
    status: "saving",
    statusError: undefined,
    versionConflictNote: undefined,
  }
}

/**
 * Apply a structural (immediate) edit.
 * @category App
 */
export function applyStructuralEdit(
  state: EditSessionState,
  label: string,
  edit: (manifest: ExecutionManifest) => StructureEditResult,
  scripts?: Record<string, string>,
): { state: EditSessionState; queued: boolean } {
  const result = edit(state.local)
  if (!result.ok) {
    return { state: { ...state, structureError: result.reason }, queued: false }
  }
  const before: HistorySnapshot = { manifest: state.local }
  const entry: PendingEntry = { kind: "edit", label, apply: edit, scripts }
  let next: EditSessionState = {
    ...state,
    local: result.manifest,
    structureError: undefined,
    pending: [...state.pending, entry],
    draftDiscardNote: undefined,
    versionConflictNote: undefined,
    status: "saving",
  }
  next = pushUndo(next, before)
  return { state: next, queued: true }
}

/**
 * Queue a text edit after debounce (caller runs the pure edit).
 * @category App
 */
export function queueTextEdit(
  state: EditSessionState,
  label: string,
  edit: (manifest: ExecutionManifest) => StructureEditResult,
  scripts?: Record<string, string>,
): { state: EditSessionState; ok: boolean; reason?: string } {
  const result = edit(state.local)
  if (!result.ok) {
    return { state: { ...state, structureError: result.reason }, ok: false, reason: result.reason }
  }
  const before: HistorySnapshot = { manifest: state.local }
  const entry: PendingEntry = { kind: "edit", label, apply: edit, scripts }
  let next: EditSessionState = {
    ...state,
    local: result.manifest,
    structureError: undefined,
    pending: [...state.pending, entry],
    draftDiscardNote: undefined,
    versionConflictNote: undefined,
  }
  next = pushUndo(next, before)
  next = { ...next, status: next.inFlightCount > 0 || next.pending.length > 0 ? "saving" : "saving" }
  return { state: next, ok: true }
}

/**
 * Record commit success: drop in-flight prefix and track returned version.
 * @category App
 */
export function commitSucceeded(
  state: EditSessionState,
  version: number | string,
  issues: readonly ValidationIssue[],
): EditSessionState {
  const pending = state.pending.slice(state.inFlightCount)
  const ownVersions = state.ownVersions.includes(version) ? state.ownVersions : [...state.ownVersions, version]
  return {
    ...state,
    version,
    pending,
    inFlightCount: 0,
    ownVersions,
    validation: validationFromIssues(issues),
    status: pending.length > 0 ? "saving" : "saved",
    statusError: undefined,
    versionConflictNote: undefined,
    // Retrieves started at or before this acknowledgement may have read the file before our write landed.
    commitAckGeneration: state.retrieveGeneration,
  }
}

/**
 * Record a non-conflict commit refusal.
 * @category App
 */
export function commitRefused(state: EditSessionState, message: string): EditSessionState {
  return {
    ...state,
    inFlightCount: 0,
    status: "error",
    statusError: message,
  }
}

/**
 * Record version conflict on commit (in-flight entries stay for replay).
 * @category App
 */
export function commitVersionConflict(state: EditSessionState): EditSessionState {
  return {
    ...state,
    inFlightCount: 0,
    status: "saving",
  }
}

/**
 * Replay pending entries onto `base` after an external conflict; returns manifest and dropped labels.
 * @category App
 */
export function replayPendingOnConflict(
  base: ExecutionManifest,
  pending: readonly PendingEntry[],
): { manifest: ExecutionManifest; scripts?: Record<string, string>; dropped: string[]; kept: PendingEntry[] } {
  let manifest = base
  const scripts: Record<string, string> = {}
  const dropped: string[] = []
  const kept: PendingEntry[] = []
  for (const entry of pending) {
    if (entry.kind === "restore") {
      dropped.push(entry.label)
      continue
    }
    const result = entry.apply(manifest)
    if (!result.ok) {
      dropped.push(entry.label)
      continue
    }
    manifest = result.manifest
    kept.push(entry)
    if (entry.scripts) Object.assign(scripts, entry.scripts)
  }
  return {
    manifest,
    scripts: Object.keys(scripts).length > 0 ? scripts : undefined,
    dropped,
    kept,
  }
}

function fixApplyConflictReplay(
  state: EditSessionState,
  reloaded: ExecutionManifest,
  version: number | string,
  issues: readonly ValidationIssue[],
  replay: ReturnType<typeof replayPendingOnConflict>,
): EditSessionState {
  const note = replay.dropped.length > 0 ? formatVersionConflictNote(replay.dropped) : undefined
  return {
    ...state,
    local: replay.kept.length > 0 ? replay.manifest : reloaded,
    version,
    validation: validationFromIssues(issues),
    pending: replay.kept,
    inFlightCount: 0,
    ownVersions: [],
    versionConflictNote: note,
    status: replay.kept.length > 0 ? "saving" : "saved",
  }
}

/**
 * Full conflict handling when the latest item is already retrieved.
 * @category App
 */
export function resolveConflictWithItem(state: EditSessionState, item: ExecutionItem): EditSessionState {
  const replay = replayPendingOnConflict(item.manifest, state.pending)
  return fixApplyConflictReplay(state, item.manifest, item.version, item.issues, replay)
}

/**
 * Classify an incoming retrieve.
 * @category App
 */
export function classifyRetrieve(
  state: EditSessionState,
  item: ExecutionItem,
  options: { isFirstLoad: boolean; retrieveGeneration: number },
): RetrieveClassification {
  if (options.isFirstLoad) return { kind: "initial" }
  if (options.retrieveGeneration <= state.commitAckGeneration) {
    const version = item.version
    if (version === state.version || state.ownVersions.includes(version)) return { kind: "stale" }
    return { kind: "stale" }
  }
  const version = item.version
  // The file should hold the last acknowledged version, so that one is always our own echo.
  if (version === state.version) return { kind: "own-echo" }
  const busy = state.inFlightCount > 0 || state.pending.length > 0
  if (busy) {
    // Earlier commits of ours can still echo while later ones are outstanding.
    return state.ownVersions.includes(version) ? { kind: "own-echo" } : { kind: "deferred" }
  }
  // Idle: anything else changed on disk without us, even bytes we wrote earlier (an external revert).
  return { kind: "external" }
}

/**
 * Consume an own-echo retrieve (do not replace local when ahead of disk).
 * @category App
 */
export function applyOwnEchoRetrieve(state: EditSessionState, item: ExecutionItem): EditSessionState {
  const version = item.version
  const pendingEmpty = state.pending.length === 0 && state.inFlightCount === 0
  // Once idle, older own versions no longer describe the file; keep them only while commits are outstanding.
  const ownVersions = pendingEmpty ? [] : state.ownVersions.filter((entry) => entry !== version)
  return {
    ...state,
    ownVersions,
    version: pendingEmpty ? item.version : state.version,
    validation: pendingEmpty ? validationFromIssues(item.issues) : state.validation,
  }
}

/**
 * Replace state from an external reload.
 * @category App
 */
export function applyExternalRetrieve(
  state: EditSessionState,
  item: ExecutionItem,
  hadTextPending: boolean,
): EditSessionState {
  return {
    ...state,
    local: item.manifest,
    version: item.version,
    validation: validationFromIssues(item.issues),
    pending: [],
    inFlightCount: 0,
    ownVersions: [],
    undo: [],
    redo: [],
    versionConflictNote: undefined,
    draftDiscardNote: hadTextPending ? DRAFT_DISCARD_NOTE : undefined,
    fieldEpoch: state.fieldEpoch + 1,
    externalEpoch: state.externalEpoch + 1,
    textScheduler: textSchedulerDiscard(state.textScheduler),
    status: "saved",
    statusError: undefined,
    structureError: undefined,
  }
}

/**
 * Begin tracking a retrieve generation (call before await retrieve).
 * @category App
 */
export function beginRetrieve(state: EditSessionState): { state: EditSessionState; generation: number } {
  const generation = state.retrieveGeneration + 1
  return {
    state: { ...state, retrieveGeneration: generation, pendingRetrieveGeneration: generation },
    generation,
  }
}

/**
 * Undo: queue restore commit.
 * @category App
 */
export function applyUndo(state: EditSessionState): EditSessionState | undefined {
  const snapshot = state.undo[state.undo.length - 1]
  if (!snapshot) return undefined
  const current: HistorySnapshot = { manifest: state.local }
  const undo = state.undo.slice(0, -1)
  const redo = [...state.redo, current]
  const entry: PendingEntry = {
    kind: "restore",
    label: "Undo",
    manifest: snapshot.manifest,
    scripts: snapshot.scripts,
  }
  return {
    ...state,
    local: snapshot.manifest,
    undo,
    redo,
    pending: [...state.pending, entry],
    status: "saving",
    versionConflictNote: undefined,
    draftDiscardNote: undefined,
  }
}

/**
 * Redo: queue restore commit.
 * @category App
 */
export function applyRedo(state: EditSessionState): EditSessionState | undefined {
  const snapshot = state.redo[state.redo.length - 1]
  if (!snapshot) return undefined
  const current: HistorySnapshot = { manifest: state.local }
  const redo = state.redo.slice(0, -1)
  const undo = [...state.undo, current]
  const entry: PendingEntry = {
    kind: "restore",
    label: "Redo",
    manifest: snapshot.manifest,
    scripts: snapshot.scripts,
  }
  return {
    ...state,
    local: snapshot.manifest,
    undo,
    redo,
    pending: [...state.pending, entry],
    status: "saving",
    versionConflictNote: undefined,
    draftDiscardNote: undefined,
  }
}

/**
 * True when undo is available.
 * @category App
 */
export function canUndo(state: EditSessionState): boolean {
  return state.undo.length > 0
}

/**
 * True when redo is available.
 * @category App
 */
export function canRedo(state: EditSessionState): boolean {
  return state.redo.length > 0
}

/**
 * True when leaving the page should prompt (commit or debounce in progress).
 * @category App
 */
export function shouldWarnBeforeUnload(state: EditSessionState): boolean {
  return state.inFlightCount > 0 || state.pending.length > 0 || textSchedulerPending(state.textScheduler)
}

/**
 * Snapshot manifest for tests.
 * @category App
 */
export function snapshotManifest(manifest: ExecutionManifest): ExecutionManifest {
  return cloneManifest(manifest)
}