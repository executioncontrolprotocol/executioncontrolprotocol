import type {
  CommitData,
  CommitInput,
  ExecutionItem,
  ExecutionManifest,
  OperationError,
  OperationResponse,
  RetrieveData,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import type { AppValidation } from "./results.js"

/**
 * How the App opened an execution (path or stored id).
 * @category App
 */
export type ExecutionAddress = { kind: "path"; path: string } | { kind: "id"; id: string }

const EXECUTION_LOAD_CODE = "ECP_EXECUTION_LOAD"
const VERSION_CONFLICT_CODE = "ECP_VERSION_CONFLICT"

/**
 * Banner text after a version conflict on commit.
 * @category App
 */
/** @deprecated Use {@link formatVersionConflictNote} from `edit-session.js` with dropped labels. */
export const VERSION_CONFLICT_NOTE =
  "This execution changed elsewhere. Reloaded the latest version; discarded: edit."

/**
 * Document fields updated by retrieve and commit mappers.
 * @category App
 */
export interface DocumentSnapshot {
  /** Last good manifest. */
  manifest?: ExecutionManifest
  /** Storage version (string for paths, number for ids). */
  version?: number | string
  /** Failed load refusal. */
  loadError?: OperationError
  /** One-line note after `ECP_VERSION_CONFLICT`. */
  versionConflictNote?: string
}

/**
 * Validation from `ExecutionItem.issues` or draft-commit `issues`.
 * @category App
 */
export function validationFromIssues(issues: readonly ValidationIssue[]): AppValidation {
  const sorted = [...issues].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1
    return a.path.localeCompare(b.path)
  })
  return { valid: !sorted.some((issue) => issue.severity === "error"), issues: sorted }
}

/**
 * True when `value` is a plain object manifest (not array / null).
 * @category App
 */
export function isPlainManifest(value: unknown): value is ExecutionManifest {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Map a successful execution retrieve into document fields.
 * @category App
 */
export function applyRetrieveItem(
  prev: DocumentSnapshot,
  item: ExecutionItem,
  options: { keepConflictNote?: boolean } = {},
): Partial<DocumentSnapshot> & { validation: AppValidation; bumpLoad: true } {
  if (!isPlainManifest(item.manifest)) {
    return {
      manifest: prev.manifest,
      version: prev.version,
      loadError: {
        code: EXECUTION_LOAD_CODE,
        message: "The execution file does not contain a JSON object.",
      },
      validation: validationFromIssues([]),
      bumpLoad: true,
      versionConflictNote: options.keepConflictNote ? prev.versionConflictNote : undefined,
    }
  }
  return {
    manifest: item.manifest,
    version: item.version,
    validation: validationFromIssues(item.issues),
    loadError: undefined,
    versionConflictNote: options.keepConflictNote ? prev.versionConflictNote : undefined,
    bumpLoad: true,
  }
}

/**
 * Map a refused retrieve (for example unparseable path file) into document fields.
 * @category App
 */
export function applyRetrieveRefusal(
  prev: DocumentSnapshot,
  error: OperationError,
): Partial<DocumentSnapshot> {
  return {
    manifest: prev.manifest,
    version: prev.version,
    loadError: error,
  }
}

/**
 * Apply a commit update response: success updates version and validation; conflict is flagged.
 * @category App
 */
export function interpretCommitResponse(
  response: OperationResponse<CommitData>,
):| { ok: true; version: number | string; issues: ValidationIssue[] }
  | { ok: false; versionConflict: true }
  | { ok: false; message: string } {
  if (!response.ok) {
    if (response.error.code === VERSION_CONFLICT_CODE) return { ok: false, versionConflict: true }
    return { ok: false, message: response.error.message }
  }
  const version = response.data.version
  if (version === null || version === undefined) {
    return { ok: false, message: "Commit succeeded without a version." }
  }
  return { ok: true, version, issues: response.data.issues ?? [] }
}

/**
 * State patch after a successful draft commit (does not bump reload count).
 * @category App
 */
export function applyCommitSuccess(
  manifest: ExecutionManifest,
  version: number | string,
  issues: readonly ValidationIssue[],
): Pick<DocumentSnapshot, "manifest" | "version" | "loadError" | "versionConflictNote"> & {
  validation: AppValidation
} {
  return {
    manifest,
    version,
    validation: validationFromIssues(issues),
    loadError: undefined,
    versionConflictNote: undefined,
  }
}

/**
 * Build a draft execution update, or a refusal reason before calling the host.
 * @category App
 */
export function executionUpdateInput(
  source: ExecutionAddress,
  manifest: ExecutionManifest,
  version: number | string | undefined,
  scripts?: Record<string, string>,
): CommitInput | { error: string } {
  if (version === undefined) return { error: "Stored version is not loaded." }
  if (source.kind === "path") {
    if (typeof version !== "string") return { error: "Path version is not loaded." }
    if (scripts && Object.keys(scripts).length > 0) {
      return {
        type: "execution",
        action: "update",
        path: source.path,
        object: manifest,
        ifVersion: version,
        draft: true,
        scripts,
      }
    }
    return {
      type: "execution",
      action: "update",
      path: source.path,
      object: manifest,
      ifVersion: version,
      draft: true,
    }
  }
  if (typeof version !== "number") return { error: "Stored version is not loaded." }
  if (scripts && Object.keys(scripts).length > 0) {
    return { error: "Script files cannot be saved for stored execution ids." }
  }
  return {
    type: "execution",
    action: "update",
    id: source.id,
    object: manifest,
    ifVersion: version,
    draft: true,
  }
}

/**
 * Read one script body from a retrieve response that included `scripts`.
 * @category App
 */
/**
 * True when {@link executionUpdateInput} refused before calling the host.
 * @category App
 */
export function isExecutionUpdateRefusal(
  value: CommitInput | { error: string },
): value is { error: string } {
  return !("type" in value) && typeof (value as { error?: string }).error === "string"
}

export function scriptTextFromRetrieve(
  response: OperationResponse<RetrieveData>,
  manifestKey: string,
): { ok: true; text: string } | { ok: false; message: string } {
  if (!response.ok) {
    return {
      ok: false,
      message: response.error.code === "ECP_NOT_FOUND" ? response.error.message : response.error.message,
    }
  }
  if (response.data.type !== "execution" || !("item" in response.data)) {
    return { ok: false, message: "Execution was not returned." }
  }
  const item = response.data.item as ExecutionItem
  const scripts = item.scripts
  if (!scripts || typeof scripts[manifestKey] !== "string") {
    return { ok: false, message: `Script file ${manifestKey} was not found.` }
  }
  return { ok: true, text: scripts[manifestKey]! }
}