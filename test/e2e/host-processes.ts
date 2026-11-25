import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { inject } from "vitest"
import type { HostFile } from "@executioncontrolprotocol/protocol"
import { type HostProcessRegistryEntry } from "./host-process-registry.js"
import {
  isPidAlive,
  killPidOnly,
  readProcessCreationTimeMs,
} from "./host-process-shared.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
export const hostMainEntry = path.join(repoRoot, "packages/host/dist/main.js")
export const hostSupervisorEntry = path.join(repoRoot, "packages/host/dist/supervisor.js")

const STOP_WAIT_MS = 8_000
const ALIVE_POLL_MS = 200

const trackedHomes = new Set<string>()
const registeredPids = new Map<number, HostProcessRegistryEntry>()

function registryDir(): string | undefined {
  try {
    return inject("ecpTestProcRegistry")
  } catch {
    // Set by global-setup in the Vitest main process and inherited by workers; unique per run.
    return process.env.ECP_TEST_PROC_REGISTRY || undefined
  }
}

/**
 * Track a temp `ECP_HOME` created for e2e/integration.
 * @category Test
 */
export function registerCliHome(home: string): void {
  trackedHomes.add(path.resolve(home))
}

/**
 * Register a directly spawned supervisor or host child.
 * @category Test
 */
export async function registerDirectHostProcess(
  pid: number,
  role: "supervisor" | "host",
  home: string,
): Promise<void> {
  const creation = await readProcessCreationTimeMs(pid)
  const entry: HostProcessRegistryEntry = {
    pid,
    role,
    home: path.resolve(home),
    entryPath: role === "supervisor" ? hostSupervisorEntry : hostMainEntry,
    createdAtMs: creation,
  }
  registeredPids.set(pid, entry)
  writeRegistryFile(entry)
}

function writeRegistryFile(entry: HostProcessRegistryEntry): void {
  const dir = registryDir()
  if (!dir) return
  const target = path.join(dir, `${entry.role}-${entry.pid}.json`)
  writeFileSync(target, `${JSON.stringify(entry)}\n`)
}

/**
 * Register supervisor/host pids from an existing `host.json` (F22).
 * @category Test
 */
export async function registerHostFromHome(home: string): Promise<void> {
  await refreshRegistryFromHome(path.resolve(home))
}

async function refreshRegistryFromHome(home: string): Promise<void> {
  const hostJson = path.join(home, "host.json")
  if (!existsSync(hostJson)) return
  let file: HostFile
  try {
    file = JSON.parse(readFileSync(hostJson, "utf8")) as HostFile
  } catch {
    return
  }
  for (const [pid, role] of [
    [file.hostPid, "host"],
    [file.supervisorPid, "supervisor"],
  ] as const) {
    if (!pid || registeredPids.has(pid)) continue
    const creation = await readProcessCreationTimeMs(pid)
    const entry: HostProcessRegistryEntry = {
      pid,
      role,
      home,
      entryPath: role === "supervisor" ? hostSupervisorEntry : hostMainEntry,
      createdAtMs: creation,
    }
    registeredPids.set(pid, entry)
    writeRegistryFile(entry)
  }
}

async function waitForPidDead(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true
    await delay(ALIVE_POLL_MS)
  }
  return !isPidAlive(pid)
}

async function postControlStop(file: HostFile, force: boolean): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${file.controlPort}/stop`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${file.token}`,
        Host: `127.0.0.1:${file.controlPort}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force }),
    })
  } catch {
    // fall through to pid kill
  }
}

async function stopHome(home: string): Promise<void> {
  const resolved = path.resolve(home)
  const hostJsonPath = path.join(resolved, "host.json")
  let file: HostFile | undefined
  if (existsSync(hostJsonPath)) {
    try {
      file = JSON.parse(readFileSync(hostJsonPath, "utf8")) as HostFile
    } catch {
      file = undefined
    }
  }
  if (file) {
    await postControlStop(file, true)
    const deadline = Date.now() + STOP_WAIT_MS
    while (Date.now() < deadline) {
      if (!existsSync(hostJsonPath)) break
      await delay(ALIVE_POLL_MS)
    }
    const hostPid = file.hostPid
    const supervisorPid = file.supervisorPid
    if (hostPid && isPidAlive(hostPid)) killPidOnly(hostPid)
    await waitForPidDead(hostPid, STOP_WAIT_MS)
    if (supervisorPid && isPidAlive(supervisorPid)) killPidOnly(supervisorPid)
    await waitForPidDead(supervisorPid, STOP_WAIT_MS)
  }
  if (existsSync(resolved)) {
    try {
      rmSync(resolved, { recursive: true, force: true })
    } catch {
      // orphan rule may still be stopping
    }
  }
}

/**
 * Per-test teardown for tracked homes and relay sessions.
 * @category Test
 */
export async function cleanupTrackedHostHomes(): Promise<void> {
  for (const home of [...trackedHomes]) {
    await refreshRegistryFromHome(home)
    await stopHome(home)
    trackedHomes.delete(home)
  }
}
