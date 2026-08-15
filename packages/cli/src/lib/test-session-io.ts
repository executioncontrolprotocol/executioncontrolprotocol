import { writeFile, readFile } from "node:fs/promises"
import type { TestSessionSnapshot } from "@executioncontrolprotocol/types"

/**
 * Read a test session snapshot JSON file.
 * @category CLI
 */
export async function readTestSessionFile(path: string): Promise<TestSessionSnapshot> {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch {
    throw new Error(`--session: cannot read file "${path}"`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`--session: invalid JSON in "${path}" (${message})`)
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as TestSessionSnapshot).schema !== "@executioncontrolprotocol.test.session"
  ) {
    throw new Error(
      `--session: expected schema "@executioncontrolprotocol.test.session" in "${path}"`
    )
  }
  return parsed as TestSessionSnapshot
}

/**
 * Write a test session snapshot JSON file.
 * @category CLI
 */
export async function writeTestSessionFile(
  path: string,
  snapshot: TestSessionSnapshot
): Promise<void> {
  await writeFile(path, JSON.stringify(snapshot, null, 2) + "\n", "utf8")
}
