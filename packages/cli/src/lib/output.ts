import { writeFileSync } from "node:fs"
import type { OperationResponse, PluginInfo, RetrieveType, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { exitCodeForEnvelope, exitWith } from "./exit.js"

const CELL_TRUNCATE = 60

/**
 * Whether colour/emoji should be suppressed.
 * @category CLI
 */
export function plainOutput(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.NO_COLOR) || !process.stdout.isTTY
}

/**
 * Print a spec 06 envelope and exit (CLI-owned commands).
 * @category CLI
 */
export function writeEnvelope(
  envelope: OperationResponse<unknown>,
  options: { json?: boolean; human?: () => void; exitCode?: number },
): never {
  const code = options.exitCode ?? exitCodeForEnvelope(envelope)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`)
    exitWith(code)
  }
  if (!envelope.ok) {
    printError(envelope.error)
    exitWith(code)
  }
  options.human?.()
  exitWith(code)
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
 * Truncate a table cell for human output.
 * @category CLI
 */
export function truncateCell(value: string, max = CELL_TRUNCATE): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

/**
 * Print an aligned table (header row, two-space column gap).
 * @category CLI
 */
export function printTable(columns: Array<{ key: string; header: string }>, rows: Array<Record<string, string>>): void {
  if (rows.length === 0) return
  const widths = Object.fromEntries(
    columns.map((col) => [
      col.key,
      Math.max(col.header.length, ...rows.map((row) => (row[col.key] ?? "").length)),
    ]),
  ) as Record<string, number>
  const line = (row: Record<string, string>): string =>
    columns.map((col) => (row[col.key] ?? "").padEnd(widths[col.key] ?? col.header.length)).join("  ")
  process.stdout.write(`${line(Object.fromEntries(columns.map((col) => [col.key, col.header])))}\n`)
  for (const row of rows) process.stdout.write(`${line(row)}\n`)
}

/**
 * Human table for plugin retrieve rows.
 * @category CLI
 */
export function printPluginsHuman(data: unknown): void {
  const body = data as { items?: PluginInfo[] }
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    process.stdout.write("No plugins installed.\n")
    return
  }
  const rows = items.map((item) => ({
    package: item.package,
    version: item.version,
    source: item.source,
    manifest: formatPluginManifest(item),
  }))
  printTable(
    [
      { key: "package", header: "package" },
      { key: "version", header: "version" },
      { key: "source", header: "source" },
      { key: "manifest", header: "manifest" },
    ],
    rows,
  )
}

function formatPluginManifest(item: PluginInfo): string {
  if (item.manifestOk) return "ok"
  const issue = item.issues?.[0]
  if (!issue) return "invalid"
  const message = truncateCell(issue.message)
  return `${issue.code} ${message}`
}

const EMPTY_RETRIEVE: Record<RetrieveType, string> = {
  capability: "No capabilities found.",
  execution: "No executions found.",
  config: "No configs found.",
  run: "No runs found.",
  plugin: "No plugins installed.",
  formatter: "No formatters found.",
  schema: "Schema not available.",
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
  const errorIssues = issues.filter((issue) => issue.severity === "error")
  if (errorIssues.length > 0) {
    const noun = errorIssues.length === 1 ? "validation error" : "validation errors"
    // The header is the code and a count only; each issue line carries its own path.
    process.stderr.write(`${error.code}  ${errorIssues.length} ${noun}\n`)
    for (const issue of issues) {
      process.stderr.write(`${issue.path}  ${issue.code}  ${issue.message}\n`)
      for (const suggestion of issue.suggestions ?? []) {
        process.stderr.write(`  suggestion: ${suggestion}\n`)
      }
    }
    return
  }
  const path = error.path ? `${error.path}  ` : ""
  process.stderr.write(`${path}${error.code}  ${error.message}\n`)
  for (const suggestion of error.suggestions ?? []) {
    process.stderr.write(`  suggestion: ${suggestion}\n`)
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
  if (data && typeof data === "object" && "text" in (data as object)) {
    process.stdout.write(`${String((data as { text: string }).text)}\n`)
    return
  }
  if (data && typeof data === "object" && "item" in (data as object)) {
    const body = data as { type?: RetrieveType; item: Record<string, unknown> }
    if (body.type === "schema") {
      const item = body.item
      if (item.document !== undefined) {
        const text = JSON.stringify(item.document, null, 2)
        process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
        return
      }
      if (typeof item.path === "string") {
        process.stdout.write(`${item.path}\n`)
        return
      }
    }
    process.stdout.write(`${JSON.stringify(body.item, null, 2)}\n`)
    return
  }
  if (data && typeof data === "object" && "items" in (data as object)) {
    const body = data as { type?: RetrieveType; items: Array<Record<string, unknown>> }
    const type = body.type ?? "capability"
    const items = body.items ?? []
    if (items.length === 0) {
      process.stdout.write(`${EMPTY_RETRIEVE[type] ?? "No items found."}\n`)
      return
    }
    if (type === "plugin") {
      printPluginsHuman({ items })
      return
    }
    const columns = retrieveColumns(type)
    const rows = items.map((item) => retrieveRow(type, item))
    printTable(columns, rows)
    return
  }
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}

function retrieveColumns(type: RetrieveType): Array<{ key: string; header: string }> {
  switch (type) {
    case "capability":
      return [
        { key: "id", header: "id" },
        { key: "plugin", header: "plugin" },
        { key: "summary", header: "summary" },
      ]
    case "execution":
      return [
        { key: "id", header: "id" },
        { key: "version", header: "version" },
        { key: "updatedAt", header: "updatedAt" },
      ]
    case "config":
      return [
        { key: "id", header: "id" },
        { key: "plugin", header: "plugin" },
      ]
    case "run":
      return [
        { key: "id", header: "id" },
        { key: "status", header: "status" },
        { key: "startedAt", header: "startedAt" },
      ]
    case "formatter":
      return [
        { key: "id", header: "id" },
        { key: "mediaType", header: "mediaType" },
        { key: "default", header: "default" },
      ]
    default:
      return [{ key: "id", header: "id" }]
  }
}

function retrieveRow(type: RetrieveType, item: Record<string, unknown>): Record<string, string> {
  const raw = (key: string): string => String(item[key] ?? "")
  const summaryCell = (key: string): string => truncateCell(raw(key))
  switch (type) {
    case "capability":
      return { id: raw("id"), plugin: raw("plugin"), summary: summaryCell("summary") }
    case "execution":
      return { id: raw("id"), version: raw("version"), updatedAt: raw("updatedAt") }
    case "config":
      return { id: raw("id"), plugin: raw("plugin") }
    case "run":
      return { id: raw("id"), status: raw("status"), startedAt: raw("startedAt") }
    case "formatter":
      return {
        id: raw("id"),
        mediaType: raw("mediaType"),
        default: item.default === true ? "yes" : item.default === false ? "no" : raw("default"),
      }
    default:
      return { id: raw("id") }
  }
}

/**
 * Human execute formatting.
 * @category CLI
 */
export function printExecuteHuman(data: unknown): void {
  if (data && typeof data === "object" && "validation" in (data as object) && !("runId" in (data as object))) {
    // ValidationResult uses `valid` (spec 03); an earlier `ok` check printed nothing for valid files.
    const validation = (data as { validation: { valid: boolean; issues: ValidationIssue[] } }).validation
    const errors = validation.issues.filter((issue) => issue.severity === "error")
    if (validation.valid) {
      process.stdout.write("valid\n")
    } else {
      const noun = errors.length === 1 ? "validation error" : "validation errors"
      process.stdout.write(`ECP_MANIFEST_INVALID  ${errors.length} ${noun}\n`)
    }
    // Errors, then warnings (a valid file can still carry warnings).
    for (const issue of validation.issues) {
      process.stdout.write(`${issue.path}  ${issue.code}  ${issue.message}\n`)
      for (const suggestion of issue.suggestions ?? []) {
        process.stdout.write(`  suggestion: ${suggestion}\n`)
      }
    }
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
  const row = data as { type: string; id?: string; version: number | string | null }
  const label = row.id ?? "path"
  process.stdout.write(`${row.type}  ${label}  ${row.version ?? "deleted"}\n`)
}