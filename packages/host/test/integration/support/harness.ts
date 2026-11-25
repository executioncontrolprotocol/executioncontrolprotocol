import { mkdtemp, readFile, readdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createLocalHost, type LocalHost } from "../../../src/index.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../")
export const pluginTestRoot = path.join(repoRoot, "plugins/plugin-test")
export const fixturesRoot = path.join(repoRoot, "fixtures")

/**
 * Start an in-process host against a temp home with plugin-test linked.
 * @category Host
 */
export async function startTestHost(options?: {
  extraPlugins?: string[]
  env?: Record<string, string>
}): Promise<{ host: LocalHost; home: string }> {
  const home = await mkdtemp(path.join(os.tmpdir(), "ecp-host-"))
  for (const [key, value] of Object.entries(options?.env ?? {})) {
    process.env[key] = value
  }
  const host = await createLocalHost({
    home,
    mode: "in-process",
    extraPlugins: options?.extraPlugins ?? [pluginTestRoot],
  })
  return { host, home }
}

/**
 * Read a JSON file under the host home.
 * @category Host
 */
export async function readJson<T>(absolutePath: string): Promise<T> {
  return JSON.parse(await readFile(absolutePath, "utf8")) as T
}

/**
 * Load NDJSON events for a run.
 * @category Host
 */
export async function readEvents(home: string, runId: string): Promise<Array<{ type: string }>> {
  const file = path.join(home, "runs", runId, "events.ndjson")
  const text = await readFile(file, "utf8")
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { type: string })
}

/**
 * List step files for a run.
 * @category Host
 */
export async function listStepFiles(home: string, runId: string): Promise<string[]> {
  const dir = path.join(home, "runs", runId, "steps")
  return readdir(dir)
}
