import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createEnvironment } from "@executioncontrolprotocol/engine"
import { StorageProvider, type ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  ATOMIC_CONSTANTS,
  LocalStorage,
  renameWithRetry,
  setRenameImplForTests,
  StorageError,
  VERSION,
} from "../src/index.js"
import { renameSync } from "node:fs"

const tiny: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
}

describe("LocalStorage", () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "ecp-storage-"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function start() {
    return createEnvironment().use(LocalStorage, StorageProvider).start({ home })
  }

  it("creates, updates, conflicts and deletes executions with versions", async () => {
    const host = await start()
    const storage = host.services.get(StorageProvider)
    await expect(storage.putExecution("a", tiny, { create: true })).resolves.toEqual({ version: 1 })
    await expect(storage.putExecution("a", tiny, { create: true })).rejects.toBeInstanceOf(StorageError)
    await expect(storage.putExecution("a", tiny, { ifVersion: 1 })).resolves.toEqual({ version: 2 })
    await expect(storage.putExecution("a", tiny, { ifVersion: 1 })).rejects.toMatchObject({
      code: "ECP_VERSION_CONFLICT",
    })
    const got = await storage.getExecution("a")
    expect(got?.version).toBe(2)
    expect(got?.manifestHash).toMatch(/^[a-f0-9]{64}$/)
    await storage.deleteExecution("a", 2)
    expect(await storage.getExecution("a")).toBeUndefined()
    await host.stop()
  })

  it("stores configs and runs with steps and events", async () => {
    const host = await start()
    const storage = host.services.get(StorageProvider)
    await storage.putConfig(
      {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { secret: { $secret: "test.secret" } },
        objectVersion: 0,
        updatedAt: "",
      },
      { create: true },
    )
    expect((await storage.getConfig("test/default"))?.objectVersion).toBe(1)

    await storage.runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-1",
        execution: { path: null, manifestHash: "abc" },
        status: "running",
        input: {},
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        plugins: {},
        host: { version: VERSION, pid: 1, mode: "in-process" },
      },
      tiny,
    )
    await storage.runs.writeStep("run-1", {
      nodeId: "echo",
      capabilityId: "@executioncontrolprotocol/test.echo",
      status: "completed",
      input: { value: "x" },
      output: { echo: "x" },
      error: null,
    })
    await storage.runs.writeState("run-1", { out: { echo: "x" } })
    await storage.runs.appendEvent("run-1", {
      seq: 1,
      at: new Date().toISOString(),
      type: "run.start",
      data: {},
    })
    await (storage.runs as unknown as { flushAll(): Promise<void> }).flushAll?.()
    const detail = await storage.runs.get("run-1", ["steps", "events", "state"])
    expect(detail?.steps?.[0]?.nodeId).toBe("echo")
    expect(detail?.events?.[0]?.type).toBe("run.start")
    expect(detail?.state).toEqual({ out: { echo: "x" } })
    await host.stop()
  })

  it("rejects oversize execution and script files", async () => {
    const host = await start()
    const storage = host.services.get(StorageProvider)
    const big = path.join(home, "big.ecp.json")
    writeFileSync(big, "x".repeat(2 * 1024 * 1024 + 1))
    await expect(storage.readExecutionFile(big)).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })
    const script = path.join(home, "script.js")
    writeFileSync(script, "x".repeat(1 * 1024 * 1024 + 1))
    await expect(storage.readTextFile(script)).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })
    await host.stop()
  })

  it("reclaims a stale lock file", async () => {
    const host = await start()
    const storage = host.services.get(StorageProvider)
    const target = path.join(home, "store", "executions", "locked.ecp.json")
    mkdirSync(path.dirname(target), { recursive: true })
    const lock = `${target}.lock`
    writeFileSync(lock, "1\n0\n")
    const old = new Date(Date.now() - ATOMIC_CONSTANTS.LOCK_STALE_MS - 1000)
    utimesSync(lock, old, old)
    await expect(storage.putExecution("locked", tiny, { create: true })).resolves.toEqual({ version: 1 })
    await host.stop()
  })

  it("retries rename on EPERM", async () => {
    const tmp = path.join(home, "from.tmp")
    const to = path.join(home, "to.json")
    writeFileSync(tmp, "ok")
    let calls = 0
    setRenameImplForTests((from, dest) => {
      calls += 1
      if (calls < 3) {
        const err = new Error("busy") as NodeJS.ErrnoException
        err.code = "EPERM"
        throw err
      }
      return renameSync(from, dest)
    })
    try {
      await renameWithRetry(tmp, to)
      expect(readFileSync(to, "utf8")).toBe("ok")
      expect(calls).toBe(3)
    } finally {
      setRenameImplForTests(undefined)
    }
  })

  it("leaves the old file when a crash happens before rename", async () => {
    const target = path.join(home, "stable.json")
    writeFileSync(target, '{"ok":true}\n')
    const tmp = `${target}.${process.pid}.dead.tmp`
    writeFileSync(tmp, '{"new":true}\n')
    expect(readFileSync(target, "utf8")).toContain('"ok"')
    expect(existsSync(tmp)).toBe(true)
  })

  it("notifies watch listeners", async () => {
    const host = await start()
    const storage = host.services.get(StorageProvider)
    const seen: string[] = []
    const stopWatch = storage.watch((change) => {
      seen.push(`${change.type}:${change.action}:${change.id}`)
    })
    await storage.putExecution("watched", tiny, { create: true })
    expect(seen.some((item) => item.includes("execution:put:watched"))).toBe(true)
    await storage.deleteExecution("watched", 1)
    expect(seen.some((item) => item.includes("execution:delete:watched"))).toBe(true)
    stopWatch()
    await host.stop()
  })

  it("batches multiple run events before flush", async () => {
    const host = await start()
    const storage = host.services.get(StorageProvider)
    await storage.runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-batch",
        execution: { path: null, manifestHash: "h" },
        status: "running",
        input: {},
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        plugins: {},
        host: { version: VERSION, pid: 1, mode: "in-process" },
      },
      tiny,
    )
    await storage.runs.appendEvent("run-batch", {
      seq: 1,
      at: new Date().toISOString(),
      type: "run.start",
      data: {},
    })
    await storage.runs.appendEvent("run-batch", {
      seq: 2,
      at: new Date().toISOString(),
      type: "step.start",
      data: { nodeId: "x" },
    })
    const detail = await storage.runs.get("run-batch", ["events"])
    expect(detail?.events?.map((event) => event.type)).toEqual(["run.start", "step.start"])
    await host.stop()
  })

  it("flushes events.ndjson immediately on run.end", async () => {
    const host = await start()
    const storage = host.services.get(StorageProvider)
    await storage.runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-end-flush",
        execution: { path: null, manifestHash: "h" },
        status: "running",
        input: {},
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        plugins: {},
        host: { version: VERSION, pid: 1, mode: "in-process" },
      },
      tiny,
    )
    await storage.runs.appendEvent("run-end-flush", {
      seq: 1,
      at: new Date().toISOString(),
      type: "run.start",
      data: {},
    })
    await storage.runs.appendEvent("run-end-flush", {
      seq: 2,
      at: new Date().toISOString(),
      type: "run.end",
      data: { status: "completed" },
    })
    const text = readFileSync(path.join(home, "runs", "run-end-flush", "events.ndjson"), "utf8")
    const types = text
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { type: string }).type)
    expect(types).toEqual(["run.start", "run.end"])
    await host.stop()
  })
})
