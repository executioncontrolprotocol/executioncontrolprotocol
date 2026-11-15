import type { Command } from "@oclif/core"
import { readFile } from "node:fs/promises"

/** Format thrown values for CLI error output. */
export function commandErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Read and parse a JSON file, mapping read/parse failures to an actionable,
 * flag-attributed error message (e.g. `--input: invalid JSON in "x.json"`).
 */
export async function readJsonFile<T = unknown>(
  path: string,
  flagName: string
): Promise<T> {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch {
    throw new Error(`${flagName}: cannot read file "${path}"`)
  }
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    throw new Error(
      `${flagName}: invalid JSON in "${path}" (${commandErrorMessage(err)})`
    )
  }
}

/**
 * Runs `fn` and maps any thrown value to `cmd.error` with exit code 1.
 * Use after `parse()` so flag validation errors are not swallowed.
 */
export async function runWithCommandError(
  cmd: Command,
  fn: () => void | Promise<void>
): Promise<void> {
  try {
    await fn()
  } catch (err) {
    cmd.error(commandErrorMessage(err), { exit: 1 })
  }
}
