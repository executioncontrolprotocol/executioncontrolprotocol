import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createEnvironment } from "@executioncontrolprotocol/engine"
import { StorageProvider, type ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { LocalStorage, setRenameImplForTests, StorageError, VERSION } from "../src/index.js"
import { renameSync } from "node:fs"

const tiny: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
}

describe("LocalStorage extra branches", () => {
  let home: string
  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "ecp-storage2-"))
  })
  afterEach(() => {
    setRenameImplForTests(undefined)
    vi.restoreAllMocks()
  })

  it("lists configs by plugin, conflicts deletes, and filters runs", async () => {
    const host = await createEnvironment().use(LocalStorage, StorageProvider).start({ home })
    const storage = host.services.get(StorageProvider)
    await storage.putConfig(
      {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: {},
        objectVersion: 0,
        updatedAt: "",
      },
      { create: true },
    )
    await storage.putConfig(
      {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "other/default",
        plugin: "@executioncontrolprotocol/other",
        values: {},
        objectVersion: 0,
        updatedAt: "",
      },
      { create: true },
    )
    expect((await storage.listConfigs("test")).map((item) => item.id)).toEqual(["test/default"])
    await expect(
      storage.putConfig(
        {
          schema: "@executioncontrolprotocol.config",
          version: "1.0",
          id: "test/default",
          plugin: "@executioncontrolprotocol/test",
          values: {},
          objectVersion: 0,
          updatedAt: "",
        },
        { create: true },
      ),
    ).rejects.toMatchObject({ code: "ECP_ALREADY_EXISTS" })
    await expect(storage.putConfig(
      {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { a: 1 },
        objectVersion: 0,
        updatedAt: "",
      },
      { ifVersion: 99 },
    )).rejects.toMatchObject({ code: "ECP_VERSION_CONFLICT" })
    await storage.putConfig(
      {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { a: 1 },
        objectVersion: 0,
        updatedAt: "",
      },
      { ifVersion: 1 },
    )
    await expect(storage.deleteConfig("test/default", 1)).rejects.toMatchObject({ code: "ECP_VERSION_CONFLICT" })
    await storage.deleteConfig("test/default", 2)
    expect(await storage.getConfig("test/default")).toBeUndefined()

    await storage.runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-a",
        execution: { id: "echo", path: null, manifestHash: "a" },
        status: "completed",
        input: {},
        result: null,
        error: null,
        startedAt: "2026-11-14T00:00:02.000Z",
        plugins: {},
        host: { version: VERSION, pid: 1, mode: "in-process" },
        clientRequestId: "c1",
      },
      tiny,
    )
    await storage.runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-b",
        execution: { id: "other", path: null, manifestHash: "b" },
        status: "failed",
        input: {},
        result: null,
        error: null,
        startedAt: "2026-11-14T00:00:01.000Z",
        plugins: {},
        host: { version: VERSION, pid: 1, mode: "in-process" },
      },
      tiny,
    )
    expect((await storage.runs.list({ status: "completed" }, 10)).map((r) => r.id)).toEqual(["run-a"])
    expect((await storage.runs.list({ executionId: "other" }, 10)).map((r) => r.id)).toEqual(["run-b"])
    expect((await storage.runs.list({ clientRequestId: "c1" }, 10)).map((r) => r.id)).toEqual(["run-a"])
    await expect(storage.runs.update("missing", { status: "failed" })).rejects.toBeInstanceOf(StorageError)
    expect(await storage.runs.get("missing")).toBeUndefined()
    expect(await storage.runs.getManifest("missing")).toBeUndefined()
    await storage.runs.update("run-a", { status: "failed" })
    expect((await storage.runs.get("run-a"))?.status).toBe("failed")
    await host.stop()
  })

  it("throws on non-retryable rename errors and exhausts EPERM retries", async () => {
    setRenameImplForTests(() => {
      const err = new Error("nope") as NodeJS.ErrnoException
      err.code = "ENOENT"
      throw err
    })
    const host = await createEnvironment().use(LocalStorage, StorageProvider).start({ home })
    await expect(
      host.services.get(StorageProvider).putExecution("x", tiny, { create: true }),
    ).rejects.toMatchObject({ code: "ENOENT" })
    await host.stop()

    let calls = 0
    setRenameImplForTests(() => {
      calls += 1
      const err = new Error("busy") as NodeJS.ErrnoException
      err.code = "EBUSY"
      throw err
    })
    const host2 = await createEnvironment().use(LocalStorage, StorageProvider).start({ home: home + "-2" })
    mkdirSync(home + "-2", { recursive: true })
    await expect(
      host2.services.get(StorageProvider).putExecution("y", tiny, { create: true }),
    ).rejects.toMatchObject({ code: "EBUSY" })
    expect(calls).toBeGreaterThan(3)
    await host2.stop()
    setRenameImplForTests(undefined)
    void renameSync
  })

  it("reads limited files that exist and lists empty dirs", async () => {
    const host = await createEnvironment().use(LocalStorage, StorageProvider).start({ home })
    const storage = host.services.get(StorageProvider)
    expect(await storage.listExecutions()).toEqual([])
    expect(await storage.listConfigs()).toEqual([])
    expect(await storage.runs.list({}, 10)).toEqual([])
    const file = path.join(home, "ok.ecp.json")
    writeFileSync(file, '{"ok":true}')
    expect(await storage.readExecutionFile(file)).toContain("ok")
    expect(await storage.readTextFile(file)).toContain("ok")
    await expect(storage.readExecutionFile(path.join(home, "missing.ecp.json"))).rejects.toMatchObject({
      code: "ECP_NOT_FOUND",
    })
    expect(existsSync(path.join(home, "store", "executions"))).toBe(true)
    await host.stop()
  })

  it("covers execution delete conflicts, stepped rounds and event flush", async () => {
    const host = await createEnvironment().use(LocalStorage, StorageProvider).start({ home })
    const storage = host.services.get(StorageProvider)
    await storage.putExecution("z", tiny, { create: true })
    await expect(storage.deleteExecution("z", 9)).rejects.toMatchObject({ code: "ECP_VERSION_CONFLICT" })
    await expect(storage.putExecution("missing", tiny, { ifVersion: 1 })).rejects.toMatchObject({
      code: "ECP_NOT_FOUND",
    })
    await expect(storage.deleteExecution("nope", 1)).rejects.toMatchObject({ code: "ECP_NOT_FOUND" })
    await expect(storage.deleteConfig("nope", 1)).rejects.toMatchObject({ code: "ECP_NOT_FOUND" })

    await storage.runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-round",
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
    await storage.runs.writeStep("run-round", {
      nodeId: "loop",
      round: 0,
      capabilityId: "@executioncontrolprotocol/test.echo",
      status: "completed",
      input: {},
      output: {},
      error: null,
    })
    await storage.runs.appendEvent("run-round", {
      seq: 1,
      at: new Date().toISOString(),
      type: "loop.round",
      data: { round: 0 },
    })
    const detail = await storage.runs.get("run-round", ["steps", "events"])
    expect(detail?.steps?.[0]?.round).toBe(0)
    expect(detail?.events?.[0]?.type).toBe("loop.round")
    expect(await storage.runs.getManifest("run-round")).toMatchObject({ version: "2.0" })
    const listed = await storage.listExecutions()
    expect(listed[0]?.id).toBe("z")

    writeFileSync(path.join(home, "store", "configs", "ignore.txt"), "nope")
    writeFileSync(path.join(home, "runs", "not-a-dir.txt"), "x")
    expect(await storage.listConfigs()).toEqual([])
    // External write: poll debounce must refresh lastSnapshot without an emit().
    writeFileSync(path.join(home, "store", "executions", "external.meta.json"), JSON.stringify({
      id: "external",
      version: 1,
      updatedAt: new Date().toISOString(),
      manifestHash: "h",
    }))
    storage.pollOnceForTests()
    await host.stop()
  })

  it("waits when a fresh lock file is held", async () => {
    const { withFileLock } = await import("../src/storage/atomic.js")
    const target = path.join(home, "locked.json")
    const lockPath = `${target}.lock`
    mkdirSync(home, { recursive: true })
    writeFileSync(lockPath, "holder\n")
    let waiting = false
    const waiter = withFileLock(target, async () => "ok", {
      onWaiting: () => {
        waiting = true
      },
    })
    await expect.poll(() => waiting, { timeout: 3_000 }).toBe(true)
    const { unlinkSync } = await import("node:fs")
    unlinkSync(lockPath)
    await expect(waiter).resolves.toBe("ok")
  })
})
