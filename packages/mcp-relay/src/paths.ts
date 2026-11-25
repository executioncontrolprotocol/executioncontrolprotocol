import path from "node:path"
import type { CommitInput, ExecuteInput, RetrieveInput } from "@executioncontrolprotocol/protocol"

/**
 * Resolve relative paths in retrieve input against cwd.
 * @category MCP
 */
export function resolveRetrievePaths(input: RetrieveInput, cwd: string): RetrieveInput {
  if (!input.output?.path) return input
  return {
    ...input,
    output: { path: resolveAgainst(cwd, input.output.path) },
  }
}

/**
 * Resolve relative paths in execute input against cwd.
 * @category MCP
 */
export function resolveExecutePaths(input: ExecuteInput, cwd: string): ExecuteInput {
  const next: ExecuteInput = { ...input }
  if (next.output?.path) {
    next.output = { path: resolveAgainst(cwd, next.output.path) }
  }
  if (next.execution && typeof next.execution === "object" && "path" in next.execution) {
    next.execution = { ...next.execution, path: resolveAgainst(cwd, next.execution.path) }
  }
  return next
}

/**
 * Resolve relative paths in commit input against cwd (object/patch file refs are already inlined by clients).
 * @category MCP
 */
export function resolveCommitPaths(input: CommitInput, _cwd: string): CommitInput {
  return input
}

/**
 * Absolute-or-relative path → absolute under cwd.
 * @category MCP
 */
export function resolveAgainst(cwd: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value)
}
