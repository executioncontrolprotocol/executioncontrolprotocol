import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import {
  shouldKillRegisteredProcess,
  type HostProcessRegistryEntry,
} from "./host-process-registry.js"
import {
  isPidAlive,
  killPidOnly,
  readProcessCommandLine,
  readProcessCreationTimeMs,
} from "./host-process-shared.js"

async function readRegistryEntries(dir: string): Promise<HostProcessRegistryEntry[]> {
  const entries: HostProcessRegistryEntry[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue
    try {
      entries.push(JSON.parse(readFileSync(path.join(dir, name), "utf8")) as HostProcessRegistryEntry)
    } catch {
      // skip corrupt entry
    }
  }
  return entries
}

/**
 * Vitest global teardown: kill only registered pids that still match.
 * @category Test
 */
export async function runGlobalHostProcessTeardown(registryPath: string): Promise<void> {
  if (!existsSync(registryPath)) return
  const entries = await readRegistryEntries(registryPath)
  const hosts = entries.filter((entry) => entry.role === "host")
  const supervisors = entries.filter((entry) => entry.role === "supervisor")
  const survivors: HostProcessRegistryEntry[] = []

  for (const entry of [...hosts, ...supervisors]) {
    if (!isPidAlive(entry.pid)) continue
    const observed = {
      commandLine: await readProcessCommandLine(entry.pid),
      createdAtMs: await readProcessCreationTimeMs(entry.pid),
    }
    if (!shouldKillRegisteredProcess(entry, observed)) {
      continue
    }
    killPidOnly(entry.pid)
    if (isPidAlive(entry.pid)) {
      survivors.push(entry)
    }
  }

  if (survivors.length > 0) {
    const detail = survivors.map((entry) => `${entry.role} pid=${entry.pid} home=${entry.home}`).join("; ")
    throw new Error(`e2e host-process teardown: registered processes still alive: ${detail}`)
  }

  try {
    rmSync(registryPath, { recursive: true, force: true })
  } catch {
    // ignore
  }
}