import { writeFileSync } from "node:fs"
import type { OperationResponse, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { exitCodeForEnvelope, exitWith } from "./exit.js"

/**
 * Whether colour/emoji should be suppressed.
 * @category CLI
 */
export function plainOutput(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.NO_COLOR) || !process.stdout.isTTY
}

/**
 * Print an operation result and exit with the catalogue code.
 * @category CLI
 */
export function finishOperation(
  envelope: OperationResponse<unknown>,
  options: { json?: boolean; out?: string; human: (data: unknown) => void },
): never {
  if (options.out && envelope.ok) {
    writeFileSync(options.out, `${JSON.stringify(envelope.data, null, 2)}\n`, "utf8")
    process.stdout.write(`wrote ${options.out}\n`)
    exitWith(exitCodeForEnvelope(envelope))
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`)
    exitWith(exitCodeForEnvelope(envelope))
  }
  if (!envelope.ok) {
    printError(envelope.error)
    exitWith(exitCodeForEnvelope(envelope))
  }
  options.human(envelope.data)
  exitWith(exitCodeForEnvelope(envelope))
}

/**
 * Print a refused operation error.
 * @category CLI
 */
export function printError(error: {
  code: string
  message: string
  path?: string
  suggestions?: string[]
  issues?: ValidationIssue[]
}): void {
  const issues = error.issues ?? []
  const first = issues[0]
  const skipHeader =
    first !== undefined &&
    error.code === first.code &&
    (error.path ?? "") === first.path &&
    error.message === first.message
  if (!skipHeader) {
    const path = error.path ? `${error.path}  ` : ""
    process.stderr.write(`${path}${error.code}  ${error.message}\n`)
    for (const suggestion of error.suggestions ?? []) {
      process.stderr.write(`  suggestion: ${suggestion}\n`)
    }
  }
  for (const issue of issues) {
    process.stderr.write(`${issue.path}  ${issue.code}  ${issue.message}\n`)
    for (const suggestion of issue.suggestions ?? []) {
      process.stderr.write(`  suggestion: ${suggestion}\n`)
    }
  }
}

/**
 * Human retrieve formatting.
 * @category CLI
 */
export function printRetrieveHuman(data: unknown): void {
  if (data && typeof data === "object" && "items" in (data as object)) {
    const rows = (data as { items: Array<Record<string, unknown>>; total: number }).items
    for (const row of rows) {
      const id = String(row.id ?? row.package ?? "")
      const extra = row.name ? `  ${String(row.name)}` : row.label ? `  ${String(row.label)}` : ""
      process.stdout.write(`${id}${extra}\n`)
    }
    return
  }
  if (data && typeof data === "object" && "text" in (data as object)) {
    process.stdout.write(`${String((data as { text: string }).text)}\n`)
    return
  }
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}

/**
 * Human execute formatting.
 * @category CLI
 */
export function printExecuteHuman(data: unknown): void {
  if (data && typeof data === "object" && "validation" in (data as object) && !("runId" in (data as object))) {
    const validation = (data as { validation: { ok: boolean; issues: ValidationIssue[] } }).validation
    if (!validation.ok) {
      for (const issue of validation.issues) {
        process.stdout.write(`${issue.path}  ${issue.code}  ${issue.message}\n`)
        for (const suggestion of issue.suggestions ?? []) {
          process.stdout.write(`  suggestion: ${suggestion}\n`)
        }
      }
      return
    }
    process.stdout.write("valid\n")
    return
  }
  const run = data as {
    runId?: string
    status?: string
    steps?: Array<{ nodeId: string; status: string }>
    result?: unknown
    error?: ValidationIssue
  }
  for (const step of run.steps ?? []) {
    process.stdout.write(`${step.nodeId}  ${step.status}\n`)
  }
  if (run.error) {
    process.stdout.write(`${run.error.path ?? ""}  ${run.error.code}  ${run.error.message}\n`)
    return
  }
  if (run.result !== undefined) {
    process.stdout.write(`${JSON.stringify(run.result, null, 2)}\n`)
    return
  }
  if (run.runId) process.stdout.write(`${run.runId}  ${run.status ?? ""}\n`)
}

/**
 * Human commit formatting.
 * @category CLI
 */
export function printCommitHuman(data: unknown): void {
  const row = data as { type: string; id: string; version: number | null }
  process.stdout.write(`${row.type}  ${row.id}  ${row.version ?? "deleted"}\n`)
}
