import type {
  CapabilityEntry,
  ExecuteData,
  ExecutionManifest,
  OperationError,
  OperationResponse,
  RetrieveData,
  RunEvent,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import type { CapabilitySchemaIndex } from "../graph/types.js"

const EXECUTION_LOAD_CODE = "ECP_EXECUTION_LOAD"

/**
 * Validation as the App shows it, from `execute { mode: "validate" }`.
 * @category App
 */
export interface AppValidation {
  /** No error-severity issue and no refusal. */
  valid: boolean
  /** Issues, errors first. */
  issues: ValidationIssue[]
  /** Refusal, when the host refused instead of returning a validation result. */
  error?: OperationError
}

/**
 * Result of {@link parseExecutionText}.
 * @category App
 */
export type ParsedExecution = { ok: true; manifest: ExecutionManifest } | { ok: false; error: OperationError }

/**
 * The single `item` of a `retrieve` by id, or undefined for a refusal or a list.
 * @category App
 */
export function retrieveItem<T>(response: OperationResponse<RetrieveData>): T | undefined {
  if (!response.ok || !("item" in response.data)) return undefined
  return response.data.item as T
}

/**
 * The `items` of a list `retrieve`, or an empty list for a refusal or a single item.
 * @category App
 */
export function retrieveItems<T>(response: OperationResponse<RetrieveData>): T[] {
  if (!response.ok || !("items" in response.data)) return []
  return response.data.items as T[]
}

/**
 * Present a refusal as a validation issue (for the issue list and the run error view).
 * @category App
 */
export function issueFromError(error: OperationError): ValidationIssue {
  return {
    code: error.code as ValidationIssue["code"],
    severity: "error",
    message: error.message,
    path: error.path ?? "",
    ...(error.suggestions ? { suggestions: error.suggestions } : {}),
  }
}

/**
 * Fold an `execute { mode: "validate" }` response into {@link AppValidation}. Invalid
 * executions come back refused with `error.issues`; other refusals become one issue.
 * @category App
 */
export function validationFromExecute(response: OperationResponse<ExecuteData>): AppValidation {
  if (response.ok) {
    const { validation } = response.data
    return { valid: validation.valid, issues: validation.issues }
  }
  const issues = response.error.issues && response.error.issues.length > 0
    ? response.error.issues
    : [issueFromError(response.error)]
  return { valid: false, issues, error: response.error }
}

/**
 * Parse execution file text. Anything other than a JSON object is an `ECP_EXECUTION_LOAD`
 * error; schema problems are left to validation.
 * @category App
 */
export function parseExecutionText(text: string): ParsedExecution {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: {
        code: EXECUTION_LOAD_CODE,
        message: `The execution file is not valid JSON: ${reason}`,
        suggestions: ["Fix the JSON syntax and save the file again."],
      },
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: { code: EXECUTION_LOAD_CODE, message: "The execution file does not contain a JSON object." },
    }
  }
  return { ok: true, manifest: value as ExecutionManifest }
}

/**
 * Capability id to its `accepts` / `returns` schemas, for typed graph ports.
 * @category App
 */
export function capabilitySchemaIndex(entries: readonly Partial<CapabilityEntry>[]): CapabilitySchemaIndex {
  const index: CapabilitySchemaIndex = {}
  for (const entry of entries) {
    if (typeof entry.id !== "string") continue
    index[entry.id] = {
      ...(entry.accepts ? { accepts: entry.accepts } : {}),
      ...(entry.returns ? { returns: entry.returns } : {}),
    }
  }
  return index
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~")
}

function nodeIdOf(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const isNode = typeof record.uses === "string" || typeof record.type === "string"
  return isNode && typeof record.id === "string" ? record.id : undefined
}

/**
 * Node an issue belongs to: `issue.nodeId` when set, else the deepest node on the issue's
 * JSON Pointer path through the manifest (an `@<nodeId>` segment counts too).
 * @category App
 */
export function issueNodeId(issue: Pick<ValidationIssue, "path" | "nodeId">, manifest?: ExecutionManifest): string | undefined {
  if (issue.nodeId) return issue.nodeId
  if (!issue.path || !issue.path.startsWith("/")) return undefined
  let current: unknown = manifest
  let found: string | undefined
  for (const raw of issue.path.slice(1).split("/")) {
    const segment = decodePointerSegment(raw)
    if (segment.startsWith("@") && segment.length > 1) {
      found = segment.slice(1)
      current = undefined
      continue
    }
    if (current === null || typeof current !== "object") continue
    current = (current as Record<string, unknown>)[segment]
    found = nodeIdOf(current) ?? found
  }
  return found
}

/**
 * Error-severity issues grouped by the node they belong to.
 * @category App
 */
export function nodeErrorIssues(
  issues: readonly ValidationIssue[],
  manifest?: ExecutionManifest,
): Record<string, ValidationIssue[]> {
  const out: Record<string, ValidationIssue[]> = {}
  for (const issue of issues) {
    if (issue.severity !== "error") continue
    const nodeId = issueNodeId(issue, manifest)
    if (!nodeId) continue
    ;(out[nodeId] ??= []).push(issue)
  }
  return out
}

const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|[\\/])/

/**
 * Absolute path of a `$script.path` value: absolute paths are kept, relative ones are
 * joined to the execution file's folder (the host resolves `.` / `..`).
 * @category App
 */
export function resolveScriptPath(executionPath: string, scriptPath: string): string {
  if (ABSOLUTE_PATH.test(scriptPath)) return scriptPath
  const cut = Math.max(executionPath.lastIndexOf("/"), executionPath.lastIndexOf("\\"))
  if (cut === -1) return scriptPath
  const separator = executionPath[cut] ?? "/"
  const relative = scriptPath.replace(/^\.[\\/]/, "")
  return `${executionPath.slice(0, cut)}${separator}${relative}`
}

function normalisePath(value: string): string {
  const slashed = value.replace(/\\/g, "/")
  return /^[A-Za-z]:\//.test(slashed) ? slashed.toLowerCase() : slashed
}

/**
 * Whether two absolute paths name the same file (separators and Windows drive case ignored).
 * @category App
 */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return normalisePath(a) === normalisePath(b)
}

/**
 * Events with `seq` greater than `lastSeq`, in `seq` order.
 * @category App
 */
export function newRunEvents(events: readonly RunEvent[], lastSeq: number): RunEvent[] {
  return events.filter((event) => event.seq > lastSeq).sort((a, b) => a.seq - b.seq)
}
