import { useCallback, useEffect, useReducer, useRef } from "react"
import type { ExecutionItem, ExecutionManifest, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { UnauthorizedError, type AppHostClient } from "../../client/index.js"
import {
  applyExternalRetrieve,
  applyOwnEchoRetrieve,
  applyRedo,
  applyStructuralEdit,
  applyUndo,
  beginInFlightCommit,
  beginRetrieve,
  canRedo,
  canUndo,
  classifyRetrieve,
  commitRefused,
  commitSucceeded,
  commitVersionConflict,
  createEditSession,
  queueTextEdit,
  resolveConflictWithItem,
  scriptsForInFlight,
  shouldPumpCommit,
  shouldWarnBeforeUnload,
  type EditSessionState,
} from "../../client/edit-session.js"
import { executionUpdateInput, interpretCommitResponse, isExecutionUpdateRefusal } from "../../client/document-state.js"
import type { StructureEditResult } from "../../graph/index.js"
import {
  AUTOSAVE_TEXT_MS,
  textSchedulerDiscard,
  textSchedulerFlush,
  textSchedulerPending,
  textSchedulerSchedule,
} from "../../client/text-scheduler.js"
import type { ExecutionSource } from "./useExecutionDocument.js"

/**
 * One manifest edit (structural or debounced text).
 * @category App
 */
export interface EditorApplyRequest {
  /** Discard-note name. */
  label: string
  apply: (manifest: ExecutionManifest) => StructureEditResult
  scripts?: Record<string, string>
}

/**
 * Result of handling a retrieve for load-count and document manifest.
 * @category App
 */
export interface RetrieveHandleOutcome {
  bumpLoad: boolean
  manifest?: ExecutionManifest
  version?: number | string
  validation?: EditSessionState["validation"]
  versionConflictNote?: string
  draftDiscardNote?: string
}

/**
 * Autosave edit session: local manifest, serialized commits, undo / redo.
 * @category App
 */
export function useExecutionEditor(
  client: AppHostClient,
  source: ExecutionSource,
  loadedManifest: ExecutionManifest | undefined,
  loadedVersion: number | string | undefined,
  loadedIssues: readonly ValidationIssue[] | undefined,
  readOnly: boolean,
  onUnauthorized: () => void,
) {
  const sessionRef = useRef<EditSessionState | undefined>(undefined)
  const pumping = useRef(false)
  const conflictReplayingRef = useRef(false)
  const textTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingText = useRef<EditorApplyRequest | undefined>(undefined)
  const readOnlyRef = useRef(readOnly)
  const [, render] = useReducer((count: number) => count + 1, 0)

  const setConflictReplaying = useCallback((value: boolean) => {
    if (conflictReplayingRef.current === value) return
    conflictReplayingRef.current = value
    render()
  }, [])

  readOnlyRef.current = readOnly

  const sync = useCallback((next: EditSessionState) => {
    sessionRef.current = next
    render()
  }, [])

  if (
    !sessionRef.current &&
    loadedManifest &&
    loadedVersion !== undefined &&
    loadedIssues !== undefined
  ) {
    sessionRef.current = createEditSession({
      manifest: loadedManifest,
      version: loadedVersion,
      issues: loadedIssues,
    })
  }
  const session = sessionRef.current

  useEffect(() => {
    if (!loadedManifest || loadedVersion === undefined || loadedIssues === undefined) return
    if (sessionRef.current) return
    sync(createEditSession({ manifest: loadedManifest, version: loadedVersion, issues: loadedIssues }))
  }, [loadedIssues, loadedManifest, loadedVersion, sync])

  const clearTextTimer = useCallback(() => {
    if (textTimer.current !== undefined) {
      clearTimeout(textTimer.current)
      textTimer.current = undefined
    }
  }, [])

  const flushPendingText = useCallback(() => {
    const request = pendingText.current
    const current = sessionRef.current
    if (!request || !current || readOnlyRef.current) return
    clearTextTimer()
    pendingText.current = undefined
    const queued = queueTextEdit(current, request.label, request.apply, request.scripts)
    if (!queued.ok) {
      sync(queued.state)
      return
    }
    sync({
      ...queued.state,
      textScheduler: textSchedulerFlush(queued.state.textScheduler),
    })
    void pumpRef.current()
  }, [clearTextTimer, sync])

  const pumpRef = useRef<() => Promise<void>>(async () => {})

  const pump = useCallback(async () => {
    if (pumping.current) return
    const start = sessionRef.current
    if (!start || !shouldPumpCommit(start)) return
    pumping.current = true
    const state = beginInFlightCommit(start)
    sync(state)
    const input = executionUpdateInput(source, state.local, state.version, scriptsForInFlight(state))
    if (isExecutionUpdateRefusal(input)) {
      sync(commitRefused(state, input.error))
      pumping.current = false
      return
    }
    try {
      const response = await client.commit(input)
      const outcome = interpretCommitResponse(response)
      const current = sessionRef.current
      if (!current) {
        pumping.current = false
        return
      }
      if (!outcome.ok) {
        if ("versionConflict" in outcome && outcome.versionConflict) {
          sync(commitVersionConflict(current))
          setConflictReplaying(true)
          let item: ExecutionItem | undefined
          try {
            const retrieved = await client.retrieve(
              source.kind === "path"
                ? { type: "execution", path: source.path }
                : { type: "execution", id: source.id },
            )
            if (retrieved.ok && retrieved.data.type === "execution" && "item" in retrieved.data) {
              item = retrieved.data.item as ExecutionItem
            }
          } catch (error) {
            if (error instanceof UnauthorizedError) onUnauthorized()
          }
          const afterConflict = sessionRef.current
          if (item && afterConflict) {
            const resolved = resolveConflictWithItem(afterConflict, item)
            sync(resolved)
          }
          setConflictReplaying(false)
          pumping.current = false
          await pumpRef.current()
          return
        }
        sync(commitRefused(current, "message" in outcome ? outcome.message : "Commit refused."))
        pumping.current = false
        return
      }
      sync(commitSucceeded(current, outcome.version, outcome.issues))
      pumping.current = false
      await pumpRef.current()
    } catch (error) {
      if (error instanceof UnauthorizedError) onUnauthorized()
      else {
        const current = sessionRef.current
        if (current) {
          sync(
            commitRefused(current, error instanceof Error ? error.message : String(error)),
          )
        }
      }
      pumping.current = false
    }
  }, [client, onUnauthorized, setConflictReplaying, source, sync])

  pumpRef.current = pump

  const apply = useCallback(
    async (request: EditorApplyRequest): Promise<boolean> => {
      if (readOnlyRef.current) return false
      const current = sessionRef.current
      if (!current) return false
      const { state, queued } = applyStructuralEdit(current, request.label, request.apply, request.scripts)
      sync(state)
      if (!queued) return false
      await pump()
      return true
    },
    [pump, sync],
  )

  const scheduleText = useCallback(
    (request: EditorApplyRequest) => {
      if (readOnlyRef.current) return
      const current = sessionRef.current
      if (!current) return
      pendingText.current = request
      clearTextTimer()
      const scheduled = textSchedulerSchedule(current.textScheduler, Date.now())
      sync({ ...current, textScheduler: scheduled, draftDiscardNote: undefined })
      textTimer.current = setTimeout(() => {
        flushPendingText()
      }, AUTOSAVE_TEXT_MS)
    },
    [clearTextTimer, flushPendingText, sync],
  )

  const discardText = useCallback(() => {
    clearTextTimer()
    pendingText.current = undefined
    const current = sessionRef.current
    if (!current) return
    sync({ ...current, textScheduler: textSchedulerDiscard(current.textScheduler) })
  }, [clearTextTimer, sync])

  const flushText = useCallback(() => {
    flushPendingText()
  }, [flushPendingText])

  const undo = useCallback(async () => {
    if (readOnlyRef.current || conflictReplayingRef.current) return
    const current = sessionRef.current
    if (!current) return
    const next = applyUndo(current)
    if (!next) return
    sync(next)
    await pump()
  }, [pump, sync])

  const redo = useCallback(async () => {
    if (readOnlyRef.current || conflictReplayingRef.current) return
    const current = sessionRef.current
    if (!current) return
    const next = applyRedo(current)
    if (!next) return
    sync(next)
    await pump()
  }, [pump, sync])

  const handleRetrieve = useCallback(
    (item: ExecutionItem, isFirstLoad: boolean, retrieveGeneration: number): RetrieveHandleOutcome => {
      const current = sessionRef.current
      if (!current) {
        const created = createEditSession({ manifest: item.manifest, version: item.version, issues: item.issues })
        sync(created)
        return {
          bumpLoad: true,
          manifest: item.manifest,
          version: item.version,
          validation: created.validation,
        }
      }
      const classification = classifyRetrieve(current, item, { isFirstLoad, retrieveGeneration })
      if (classification.kind === "initial") {
        return { bumpLoad: true }
      }
      if (classification.kind === "own-echo") {
        const next = applyOwnEchoRetrieve(current, item)
        sync(next)
        return { bumpLoad: false, validation: next.validation }
      }
      if (classification.kind === "stale" || classification.kind === "deferred") {
        return { bumpLoad: false }
      }
      if (classification.kind === "external") {
        const hadText = textSchedulerPending(current.textScheduler) || pendingText.current !== undefined
        discardText()
        const next = applyExternalRetrieve(current, item, hadText)
        sync(next)
        return {
          bumpLoad: true,
          manifest: item.manifest,
          version: item.version,
          validation: next.validation,
          draftDiscardNote: next.draftDiscardNote,
        }
      }
      return { bumpLoad: false }
    },
    [discardText, sync],
  )

  const startRetrieve = useCallback((): number => {
    const current = sessionRef.current
    if (!current) return 0
    const { state, generation } = beginRetrieve(current)
    sync(state)
    return generation
  }, [sync])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const current = sessionRef.current
      if (!current) return
      flushPendingText()
      if (shouldWarnBeforeUnload(sessionRef.current ?? current)) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      clearTextTimer()
    }
  }, [clearTextTimer, flushPendingText])

  useEffect(() => {
    return () => {
      flushPendingText()
    }
  }, [flushPendingText])

  const applyEditFn = useCallback(
    (edit: (manifest: ExecutionManifest) => StructureEditResult): Promise<boolean> => {
      return apply({ label: "Edit", apply: edit })
    },
    [apply],
  )

  return {
    local: session?.local ?? loadedManifest,
    validation: session?.validation,
    apply,
    applyEdit: applyEditFn,
    scheduleText,
    flushText,
    discardText,
    undo,
    redo,
    canUndo: session ? canUndo(session) : false,
    canRedo: session ? canRedo(session) : false,
    status: session?.status ?? "saved",
    statusError: session?.statusError,
    structureError: session?.structureError,
    versionConflictNote: session?.versionConflictNote,
    draftDiscardNote: session?.draftDiscardNote,
    fieldEpoch: session?.fieldEpoch ?? 0,
    externalEpoch: session?.externalEpoch ?? 0,
    handleRetrieve,
    startRetrieve,
    clearStructureError: () => {
      const current = sessionRef.current
      if (current) sync({ ...current, structureError: undefined })
    },
    textDebouncePending: () => {
      const current = sessionRef.current
      return (
        (current !== undefined && textSchedulerPending(current.textScheduler)) || pendingText.current !== undefined
      )
    },
    conflictReplaying: conflictReplayingRef.current,
  }
}