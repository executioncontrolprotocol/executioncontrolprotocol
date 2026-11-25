import { readFileSync } from "node:fs"
import path from "node:path"
import { stdin as input } from "node:process"

/**
 * Parse a JSON flag value: raw JSON, `@file`, or `-` (stdin).
 * @category CLI
 */
export async function parseJsonFlag(raw: string | undefined): Promise<unknown | undefined> {
  if (raw === undefined) return undefined
  if (raw === "-") {
    const text = await readStdin()
    return JSON.parse(text) as unknown
  }
  if (raw.startsWith("@")) {
    const file = path.resolve(raw.slice(1))
    return JSON.parse(readFileSync(file, "utf8")) as unknown
  }
  return JSON.parse(raw) as unknown
}

/**
 * Read all of stdin as UTF-8.
 * @category CLI
 */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

/**
 * Resolve a CLI path against cwd to an absolute path.
 * @category CLI
 */
export function resolvePath(value: string): string {
  return path.resolve(value)
}

/**
 * Positional `path | id` rule from spec 10.
 * @category CLI
 */
export function positionalPathOrId(value: string): { path: string } | { id: string } {
  if (value.endsWith(".ecp.json") || value.includes("/") || value.includes("\\")) {
    return { path: resolvePath(value) }
  }
  return { id: value }
}

/**
 * Parse repeatable `--filter key=value` into a filter object.
 * @category CLI
 */
export function parseFilters(entries: string[] | undefined): Record<string, string> | undefined {
  if (!entries || entries.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const entry of entries) {
    const eq = entry.indexOf("=")
    if (eq <= 0) {
      throw Object.assign(new Error(`ECP_REQUEST_INVALID: filter must be key=value (got ${entry}).`), {
        code: "ECP_REQUEST_INVALID",
      })
    }
    out[entry.slice(0, eq)] = entry.slice(eq + 1)
  }
  return out
}

/**
 * Split comma-separated `--include` values.
 * @category CLI
 */
export function parseInclude(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}
