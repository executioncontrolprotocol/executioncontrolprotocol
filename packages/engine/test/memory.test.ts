import { describe, expect, it } from "vitest"
import type { ConfigObject, ExecutionManifest, RunRecord } from "@executioncontrolprotocol/protocol"
import { VERSION } from "../src/version.js"
import { FixturePluginAdapter, MemorySecrets, MemoryStorage, StorageError } from "../src/testing/index.js"

const manifest: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  execution: { label: "Echo" },
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo" }],
}

const config = (objectVersion = 1): ConfigObject => ({
  schema: "@executioncontrolprotocol.config",
  version: "1.0",
  id: "test/default",
  plugin: "@executioncontrolprotocol/test",
  values: { label: "a" },
  objectVersion,
  updatedAt: "2026-11-14T00:00:00.000Z",
})

function runRecord(id: string, status: RunRecord["status"] = "running"): RunRecord {
  return {
    schema: "@executioncontrolprotocol.run",
    version: "1.0",
    id,
    execution: { path: null, manifestHash: "abc" },
    status,
    input: {},
    result: null,
    error: null,
    startedAt: `2026-11-14T00:00:0${id.at(-1)}Z`,
    plugins: {},
    host: { version: VERSION, pid: 1, mode: "in-process" },
    warnings: [],
  }
}

describe("MemoryStorage", () => {
  it("creates, updates, lists and deletes an execution", async () => {
    const storage = new MemoryStorage()
    const changes: string[] = []
    const stop = storage.watch((change) => changes.push(`${change.action}:${change.id}`))
    await expect(storage.putExecution("echo", manifest, { create: true })).resolves.toEqual({ version: 1 })
    await expect(storage.putExecution("echo", manifest, { create: true })).rejects.toMatchObject({
      code: "ECP_ALREADY_EXISTS",
    })
    await expect(storage.putExecution("echo", manifest, { ifVersion: 1 })).resolves.toEqual({ version: 2 })
    await expect(storage.putExecution("echo", manifest, { ifVersion: 1 })).rejects.toBeInstanceOf(StorageError)
    const loaded = await storage.getExecution("echo")
    expect(loaded?.version).toBe(2)
    expect(loaded?.manifest.execution?.id).toBe("echo")
    expect((await storage.listExecutions())[0]?.id).toBe("echo")
    await storage.deleteExecution("echo", 2)
    await expect(storage.deleteExecution("echo", 2)).rejects.toMatchObject({ code: "ECP_NOT_FOUND" })
    expect(await storage.getExecution("missing")).toBeUndefined()
    stop()
    await storage.putExecution("later", manifest, { create: true })
    expect(changes).toEqual(["put:echo", "put:echo", "delete:echo"])
  })

  it("versions configs, filters by plugin, and reads files only through the injected reader", async () => {
    const storage = new MemoryStorage("/tmp/ecp", {
      read: async (path) => `contents:${path}`,
    })
    await storage.putConfig(config(), { create: true })
    await expect(storage.putConfig(config(), { ifVersion: 9 })).rejects.toMatchObject({ code: "ECP_VERSION_CONFLICT" })
    expect(await storage.listConfigs("test")).toHaveLength(1)
    expect(await storage.listConfigs("@executioncontrolprotocol/other")).toEqual([])
    await storage.deleteConfig("test/default", 1)
    expect(await storage.getConfig("test/default")).toBeUndefined()
    await expect(storage.readTextFile("/tmp/script.js")).resolves.toBe("contents:/tmp/script.js")
    const bare = new MemoryStorage()
    await expect(bare.readExecutionFile("/tmp/x.ecp.json")).rejects.toMatchObject({ code: "ECP_NOT_FOUND" })
  })

  it("stores runs, steps, events and state, and filters the list", async () => {
    const storage = new MemoryStorage("/home/ecp")
    await storage.runs.create(runRecord("run-1"), manifest)
    await storage.runs.create(runRecord("run-2", "completed"), manifest)
    await storage.runs.writeStep("run-1", {
      nodeId: "echo",
      round: null,
      capabilityId: "@executioncontrolprotocol/test.echo",
      status: "completed",
      input: {},
      output: { echo: "hi" },
      error: null,
      startedAt: "2026-11-14T00:00:00.000Z",
    })
    await storage.runs.appendEvent("run-1", { seq: 1, at: "2026-11-14T00:00:00.000Z", type: "run.start", data: {} })
    await storage.runs.writeState("run-1", { echo: "hi" })
    await storage.runs.update("run-1", { status: "completed" })
    const detail = await storage.runs.get("run-1", ["steps", "events", "state"])
    expect(detail?.status).toBe("completed")
    expect(detail?.steps).toHaveLength(1)
    expect(detail?.events).toHaveLength(1)
    expect(detail?.state).toEqual({ echo: "hi" })
    expect(await storage.runs.getManifest("run-1")).toEqual(expect.objectContaining({ version: "2.0" }))
    expect(await storage.runs.list({ status: "completed" }, 10)).toHaveLength(2)
    expect(await storage.runs.list({ executionId: "missing" }, 10)).toEqual([])
    expect(storage.runs.artifactDir("run-1")).toBe("/home/ecp/runs/run-1/artifacts")
    await expect(storage.runs.update("missing", { status: "failed" })).rejects.toMatchObject({ code: "ECP_NOT_FOUND" })
    expect(await storage.runs.get("missing")).toBeUndefined()
  })
})

describe("MemoryStorage edges", () => {
  it("sorts executions, rejects stale deletes, and filters runs", async () => {
    const storage = new MemoryStorage()
    await storage.start()
    await storage.putExecution("b", manifest, { create: true })
    await storage.putExecution("a", { ...manifest, execution: undefined }, { create: true })
    const listed = await storage.listExecutions()
    expect(listed.map((item) => item.id)).toEqual(["a", "b"])
    await expect(storage.deleteExecution("a", 9)).rejects.toMatchObject({ code: "ECP_VERSION_CONFLICT" })
    await expect(storage.putExecution("missing", manifest, { ifVersion: 1 })).rejects.toMatchObject({
      code: "ECP_NOT_FOUND",
    })
    await expect(storage.putExecution("a", manifest, {})).rejects.toMatchObject({ code: "ECP_VERSION_CONFLICT" })
    await storage.putConfig(config(), { create: true })
    await expect(storage.putConfig(config(), { create: true })).rejects.toMatchObject({ code: "ECP_ALREADY_EXISTS" })
    await expect(storage.putConfig({ ...config(), id: "other/default" }, {})).rejects.toMatchObject({
      code: "ECP_NOT_FOUND",
    })
    await expect(storage.deleteConfig("test/default", 4)).rejects.toMatchObject({ code: "ECP_VERSION_CONFLICT" })
    await expect(storage.deleteConfig("absent", 1)).rejects.toMatchObject({ code: "ECP_NOT_FOUND" })
    expect(await storage.listConfigs()).toHaveLength(1)
    const record = runRecord("run-9")
    record.clientRequestId = "req-1"
    record.execution.id = "echo"
    await storage.runs.create(record, manifest)
    await storage.runs.writeStep("run-9", {
      nodeId: "echo",
      round: null,
      capabilityId: "@executioncontrolprotocol/test.echo",
      status: "completed",
      input: {},
      output: null,
      error: null,
      startedAt: "2026-11-14T00:00:00.000Z",
    })
    await storage.runs.writeStep("run-9", {
      nodeId: "echo",
      round: null,
      capabilityId: "@executioncontrolprotocol/test.echo",
      status: "failed",
      input: {},
      output: null,
      error: null,
      startedAt: "2026-11-14T00:00:01.000Z",
    })
    const detail = await storage.runs.get("run-9")
    expect(detail?.steps).toBeUndefined()
    expect(await storage.runs.list({ clientRequestId: "req-1" }, 1)).toHaveLength(1)
    expect(await storage.runs.list({ executionId: "echo" }, 5)).toHaveLength(1)
    expect(await storage.runs.getManifest("missing")).toBeUndefined()
    await storage.stop()
  })
})

describe("MemorySecrets", () => {
  it("sets, gets, lists and deletes keys without returning values from list", async () => {
    const secrets = new MemorySecrets()
    expect(await secrets.get("missing")).toBeUndefined()
    await secrets.set("test.secret", "super-secret")
    expect(await secrets.get("test.secret")).toBe("super-secret")
    expect(await secrets.list()).toEqual(["test.secret"])
    expect(await secrets.delete("test.secret")).toBe(true)
    expect(await secrets.delete("test.secret")).toBe(false)
    expect(await secrets.list()).toEqual([])
  })
})

describe("FixturePluginAdapter", () => {
  const adapter = new FixturePluginAdapter(
    {
      schema: "@executioncontrolprotocol.plugin-manifest",
      version: "2.0",
      plugin: {
        id: "@executioncontrolprotocol/test",
        package: "@executioncontrolprotocol/plugin-test",
        version: "fixture.1",
        summary: "Test",
        description: "Test plugin",
      },
      sdkVersion: "fixture.sdk",
      pluginSchema: {
        path: "./ecp.schema.json",
        hash: "a".repeat(64),
      },
      capabilities: [
        {
          id: "@executioncontrolprotocol/test.echo",
          name: "echo",
          summary: "Echo",
          description: "Echoes",
          useCases: ["tests"],
          projections: ["echo"],
        },
      ],
      entry: "./dist/index.js",
      hash: "fixture",
    },
    {
      "@executioncontrolprotocol/test.echo": async (input) => ({ echo: input }),
    },
    {
      $id: "ecp://plugins/@executioncontrolprotocol/test/fixture.1/schema.json",
      $defs: {
        "echo.accepts": { type: "object" },
        "echo.returns": { type: "object" },
        config: { type: "object" },
      },
    },
  )

  it("lists the capability and calls the handler", async () => {
    expect(adapter.capabilities()[0]?.id).toBe("@executioncontrolprotocol/test.echo")
    expect(adapter.plugins()[0]?.manifestOk).toBe(true)
    expect(adapter.configSchema("@executioncontrolprotocol/test")).toEqual({ type: "object" })
    expect(adapter.configSchema("@other/plugin")).toBeUndefined()
    const controller = new AbortController()
    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/test.echo",
          input: { value: "hi" },
          config: undefined,
          context: { runId: "run-1", stepId: "echo", state: {} },
        },
        controller.signal,
      ),
    ).resolves.toEqual({ echo: { value: "hi" } })
  })

  it("rejects an unknown capability and an aborted signal", async () => {
    const controller = new AbortController()
    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/test.missing",
          input: {},
          config: undefined,
          context: { runId: "run-1", stepId: "x", state: {} },
        },
        controller.signal,
      ),
    ).rejects.toThrow(/ECP_PLUGIN_LOAD_FAILED/)
    controller.abort()
    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/test.echo",
          input: {},
          config: undefined,
          context: { runId: "run-1", stepId: "echo", state: {} },
        },
        controller.signal,
      ),
    ).rejects.toThrow(/ECP_RUN_CANCELLED/)
  })
})
