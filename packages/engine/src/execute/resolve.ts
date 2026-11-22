import type { ExpressionEngine } from "@executioncontrolprotocol/protocol"
import { checkScript } from "../validate/expr.js"

/**
 * Failure while resolving a step input.
 * @category Environment
 */
export class ResolveError extends Error {
  /** Catalogue code. */
  readonly code: "ECP_REF_UNRESOLVED" | "ECP_EXPR_RESULT_INVALID" | "ECP_SCRIPT_INVALID" | "ECP_EXPR_FAILED" | "ECP_EXPR_TIMEOUT"

  /**
   * @param code Which resolution rule failed.
   * @param message One sentence.
   */
  constructor(code: ResolveError["code"], message: string) {
    super(message)
    this.name = "ResolveError"
    this.code = code
  }
}

/**
 * Reads a `$script` file. Paths passed here are absolute.
 * @category Environment
 */
export type ScriptReader = (absolutePath: string) => Promise<string>

/**
 * Read a step-level transform `$script` marker to source text (no UXP `params` prefix).
 * @category Environment
 */
export async function resolveStepScript(
  value: unknown,
  readText?: ScriptReader,
  executionDir?: string,
): Promise<string> {
  if (!isRecord(value)) {
    throw new ResolveError("ECP_SCRIPT_INVALID", "Transform step requires script.")
  }
  if (isRecord(value.$script)) {
    throw new ResolveError(
      "ECP_SCRIPT_INVALID",
      'Transform step script must be a plain object `{ "lang": "js", "source"?: "...", "path"?: "...", "ecmaVersion"?: n }`, not `{ "$script": ... }`.',
    )
  }
  const script = value
  let source = typeof script.source === "string" ? script.source : undefined
  if (source === undefined && typeof script.path === "string") {
    const absolute = resolvePath(executionDir, script.path)
    if (!absolute || !readText) throw new ResolveError("ECP_SCRIPT_INVALID", `Script file ${script.path} cannot be read.`)
    try {
      source = await readText(absolute)
    } catch {
      throw new ResolveError("ECP_SCRIPT_INVALID", `Script file ${script.path} was not found.`)
    }
  }
  if (source === undefined) throw new ResolveError("ECP_SCRIPT_INVALID", "Script must set source or path.")
  const version = typeof script.ecmaVersion === "number" ? script.ecmaVersion : 2020
  const failure = checkScript(source, version)
  if (failure) throw new ResolveError("ECP_SCRIPT_INVALID", failure.message)
  return source
}

/**
 * Resolve markers in a step input. `$state` handles pass through unchanged.
 * @category Environment
 */
export async function resolveValue(
  value: unknown,
  state: Record<string, unknown>,
  expression: ExpressionEngine,
  readText?: ScriptReader,
  executionDir?: string,
): Promise<unknown> {
  if (Array.isArray(value)) {
    const resolved: unknown[] = []
    for (const item of value) {
      const next = await resolveValue(item, state, expression, readText, executionDir)
      resolved.push(next === undefined ? null : next)
    }
    return resolved
  }
  if (!isRecord(value)) return value
  if (typeof value.$ref === "string") return resolveRef(value, state)
  if (typeof value.$state === "string") return { $state: value.$state }
  if (isRecord(value.$script)) return resolveScript(value.$script, state, expression, readText, executionDir)
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    const resolved = await resolveValue(child, state, expression, readText, executionDir)
    if (resolved !== undefined) output[key] = resolved
  }
  return output
}

/**
 * Resolve a single `$ref` marker against state.
 * @category Environment
 */
export async function resolveRefMarker(marker: Record<string, unknown>, state: Record<string, unknown>): Promise<unknown> {
  return resolveRef(marker, state)
}

/**
 * Read a plain state path (same syntax as `$ref`, without the marker object).
 * @category Environment
 */
export function resolveStatePath(path: string, state: Record<string, unknown>): unknown {
  if (!path.startsWith("state.")) {
    throw new ResolveError("ECP_REF_UNRESOLVED", `${path} is not a state path.`)
  }
  const found = readRef(state, path)
  if (found.missing) {
    throw new ResolveError("ECP_REF_UNRESOLVED", `${path} is not in state.`)
  }
  return found.value
}

async function resolveRef(marker: Record<string, unknown>, state: Record<string, unknown>): Promise<unknown> {
  const ref = String(marker.$ref)
  const found = readRef(state, ref)
  if (found.missing) {
    if (marker.optional === true || Object.prototype.hasOwnProperty.call(marker, "fallback")) {
      return Object.prototype.hasOwnProperty.call(marker, "fallback") ? marker.fallback : undefined
    }
    throw new ResolveError("ECP_REF_UNRESOLVED", `${ref} is not in state.`)
  }
  return found.value
}

async function resolveScript(
  script: Record<string, unknown>,
  state: Record<string, unknown>,
  expression: ExpressionEngine,
  readText: ScriptReader | undefined,
  executionDir: string | undefined,
): Promise<string> {
  const params = isRecord(script.params) ? await resolveValue(script.params, state, expression, readText, executionDir) : {}
  let source = typeof script.source === "string" ? script.source : undefined
  if (source === undefined && typeof script.path === "string") {
    const absolute = resolvePath(executionDir, script.path)
    if (!absolute || !readText) throw new ResolveError("ECP_SCRIPT_INVALID", `Script file ${script.path} cannot be read.`)
    try {
      source = await readText(absolute)
    } catch {
      throw new ResolveError("ECP_SCRIPT_INVALID", `Script file ${script.path} was not found.`)
    }
  }
  if (source === undefined) throw new ResolveError("ECP_SCRIPT_INVALID", "Script must set source or path.")
  const version = typeof script.ecmaVersion === "number" ? script.ecmaVersion : 2020
  const failure = checkScript(source, version)
  if (failure) throw new ResolveError("ECP_SCRIPT_INVALID", failure.message)
  return `const params = ${JSON.stringify(params)};\n${source}`
}

function readRef(state: Record<string, unknown>, ref: string): { missing: boolean; value?: unknown } {
  if (!ref.startsWith("state.")) return { missing: true }
  const segments = ref.slice("state.".length).split(".")
  let current: unknown = state
  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) return { missing: true }
    const next = (current as Record<string, unknown>)[segment]
    if (next === undefined) return { missing: true }
    current = next
  }
  return { missing: false, value: current }
}

function resolvePath(directory: string | undefined, filePath: string): string | undefined {
  if (filePath.startsWith("/") || filePath.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(filePath)) return filePath
  if (!directory) return undefined
  const separator = directory.includes("\\") ? "\\" : "/"
  return `${directory.replace(/[\\/]$/, "")}${separator}${filePath}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
