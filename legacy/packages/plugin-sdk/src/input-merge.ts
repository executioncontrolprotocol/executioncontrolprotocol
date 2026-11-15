import { readFile } from "node:fs/promises"
import { stdin as stdinStream } from "node:process"
import { ECP_INPUT_INVALID, EXIT_USAGE } from "./codes.js"
import { EcpCliError } from "./errors.js"
import { flagProvided } from "./flags-from-schema.js"
import { toKebabCase } from "./kebab.js"

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stdinStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function parseJsonSource(raw: string, label: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new EcpCliError(ECP_INPUT_INVALID, `${label}: expected a JSON object`, {
        exitCode: EXIT_USAGE,
      })
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    if (err instanceof EcpCliError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new EcpCliError(ECP_INPUT_INVALID, `${label}: invalid JSON (${message})`, {
      exitCode: EXIT_USAGE,
    })
  }
}

/**
 * Load `--input <file|->` JSON. Missing flag yields `{}`.
 * @category CLI
 */
export async function loadInputFile(inputFlag: string | undefined): Promise<Record<string, unknown>> {
  if (!inputFlag) return {}
  if (inputFlag === "-") {
    return parseJsonSource(await readStdin(), "--input")
  }
  let raw: string
  try {
    raw = await readFile(inputFlag, "utf8")
  } catch {
    throw new EcpCliError(ECP_INPUT_INVALID, `--input: cannot read file "${inputFlag}"`, {
      path: "--input",
      exitCode: EXIT_USAGE,
    })
  }
  return parseJsonSource(raw, `--input "${inputFlag}"`)
}

/**
 * Merge `--input` JSON with parsed flags and positional args. Explicit flags
 * override `--input`; positional args always apply when present.
 * @category CLI
 */
export function mergeInput(
  base: Record<string, unknown>,
  flagsAndArgs: Record<string, unknown>,
  argv: string[],
  schemaFieldNames: string[],
  positionalFields: string[] = []
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }
  for (const field of schemaFieldNames) {
    const kebabName = toKebabCase(field)
    const value = flagsAndArgs[kebabName] ?? flagsAndArgs[field]
    if (value === undefined) continue
    if (positionalFields.includes(field) || positionalFields.includes(kebabName)) {
      merged[field] = value
      continue
    }
    if (flagProvided(argv, kebabName)) merged[field] = value
  }
  return merged
}
