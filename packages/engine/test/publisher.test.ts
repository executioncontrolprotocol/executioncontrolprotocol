import type { CapabilityEntry, ExecutionManifest, PublishRecord } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { buildPublishEntry, createPublishLedger, markUnpublish } from "../src/execute/publish.js"
import { runExecution } from "../src/index.js"
import { MemoryStorage } from "../src/testing/index.js"

const publishCap: CapabilityEntry = {
  id: "@test/upload",
  plugin: "@test/blob",
  package: "@test/plugin",
  pluginVersion: "1.0.0",
  summary: "upload",
  description: "",
  useCases: [],
  projections: [],
  role: "publish",
  publish: { fileField: "file", locatorFields: ["blobName", "container"] },
  accepts: { type: "object" },
  returns: { type: "object" },
}

const unpublishCap: CapabilityEntry = {
  ...publishCap,
  id: "@test/delete",
  role: "unpublish",
}

const capabilities = [publishCap, unpublishCap]

describe("publish records", () => {
  it("returns undefined when locator fields are missing on output", () => {
    const entry = buildPublishEntry(
      { fileField: "file", locatorFields: ["blobName", "container"] },
      publishCap.id,
      "upload",
      null,
      "2026-11-21T00:00:00.000Z",
      { file: { kind: "file", path: "/tmp/a.png" } },
      { file: { kind: "url", url: "https://example.test/a.png" }, blobName: "a.png" },
    )
    expect(entry).toBeUndefined()
  })

  it("returns undefined when publish output is not a url file ref", () => {
    const entry = buildPublishEntry(
      { fileField: "file", locatorFields: ["blobName", "container"] },
      publishCap.id,
      "upload",
      null,
      "2026-11-21T00:00:00.000Z",
      { file: { kind: "file", path: "/tmp/a.png" } },
      { file: { kind: "file", path: "/tmp/b.png" }, blobName: "a", container: "ecp" },
    )
    expect(entry).toBeUndefined()
  })

  it("builds a publish entry without source headers", () => {
    const entry = buildPublishEntry(
      { fileField: "file", locatorFields: ["blobName", "container"] },
      publishCap.id,
      "upload",
      null,
      "2026-11-21T00:00:00.000Z",
      {
        file: { kind: "url", url: "https://origin.test/a.png", headers: { Authorization: "secret" } },
      },
      {
        file: { kind: "url", url: "https://example.test/a.png?sas=1" },
        blobName: "a.png",
        container: "ecp",
      },
    )
    expect(entry?.source).toEqual({ kind: "url", url: "https://origin.test/a.png" })
    expect(entry?.url).toBe("https://example.test/a.png?sas=1")
    expect(entry?.locator).toEqual({ blobName: "a.png", container: "ecp" })
  })

  it("marks a matching publish entry on unpublish", () => {
    const list: PublishRecord[] = [
      {
        stepId: "upload",
        round: null,
        capabilityId: publishCap.id,
        at: "2026-11-21T00:00:00.000Z",
        source: { kind: "file", path: "/tmp/a.png" },
        url: "https://example.test/a.png",
        locator: { blobName: "a.png", container: "ecp" },
      },
    ]
    markUnpublish(
      list,
      { locatorFields: ["blobName", "container"] },
      "cleanup",
      "2026-11-21T01:00:00.000Z",
      { blobName: "a.png", container: "ecp" },
      { deleted: true },
    )
    expect(list[0]?.deletedAt).toBe("2026-11-21T01:00:00.000Z")
    expect(list[0]?.deleteStepId).toBe("cleanup")
  })

  it("skips publish when the source is not a file ref", () => {
    const entry = buildPublishEntry(
      { fileField: "file", locatorFields: ["blobName", "container"] },
      publishCap.id,
      "upload",
      null,
      "2026-11-21T00:00:00.000Z",
      { file: "not-a-ref" },
      {
        file: { kind: "url", url: "https://example.test/a.png" },
        blobName: "a.png",
        container: "ecp",
      },
    )
    expect(entry).toBeUndefined()
  })

  it("does not overwrite an already deleted publish entry", () => {
    const list: PublishRecord[] = [
      {
        stepId: "upload",
        round: null,
        capabilityId: publishCap.id,
        at: "2026-11-21T00:00:00.000Z",
        source: { kind: "file", path: "/tmp/a.png" },
        url: "https://example.test/a.png",
        locator: { blobName: "a.png", container: "ecp" },
        deletedAt: "2026-11-21T00:30:00.000Z",
        deleteStepId: "old",
      },
    ]
    markUnpublish(
      list,
      { locatorFields: ["blobName", "container"] },
      "cleanup",
      "2026-11-21T01:00:00.000Z",
      { blobName: "a.png", container: "ecp" },
      { deleted: true },
    )
    expect(list[0]?.deleteStepId).toBe("old")
  })

  it("marks unpublish without requiring a prior publish match to error", () => {
    const list: PublishRecord[] = []
    markUnpublish(
      list,
      { locatorFields: ["blobName", "container"] },
      "cleanup",
      "2026-11-21T01:00:00.000Z",
      { blobName: "missing", container: "ecp" },
      { deleted: false },
    )
    expect(list).toHaveLength(0)
  })

  it("appends on publish and marks delete on unpublish during a run", async () => {
    const storage = new MemoryStorage()
    const engine = new QuickJsExpressionEngine()
    await engine.start()
  const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "upload", uses: publishCap.id, input: { file: { kind: "file", path: "/x" } }, as: "up" },
        {
          id: "delete",
          uses: unpublishCap.id,
          input: { blobName: { $ref: "state.up.blobName" }, container: { $ref: "state.up.container" } },
        },
      ],
    }
    await storage.runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-test",
        execution: { path: null, manifestHash: "h" },
        status: "running",
        input: {},
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        plugins: {},
        host: { version: "0", pid: 1, mode: "in-process" },
        warnings: [],
        publishes: [],
      },
      manifest,
    )
    await runExecution(manifest, {}, {
      capabilities,
      expression: engine,
      runId: "run-test",
      store: storage.runs,
      call: async (request) => {
        if (request.capabilityId === publishCap.id) {
          return {
            blobName: "ecp/run-test/upload/a-12345678",
            container: "ecp",
            file: { kind: "url", url: "https://example.test/a?sas=1" },
          }
        }
        return { blobName: "ecp/run-test/upload/a-12345678", container: "ecp", deleted: true }
      },
    })
    const detail = await storage.runs.get("run-test")
    expect(detail?.publishes).toHaveLength(1)
    expect(detail?.publishes?.[0]?.deletedAt).toBeDefined()
    expect(detail?.publishes?.[0]?.deleteStepId).toBe("delete")
  })

  it("does not append a publish entry when upload fails", async () => {
    const storage = new MemoryStorage()
    const engine = new QuickJsExpressionEngine()
    await engine.start()
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "upload", uses: publishCap.id, input: {}, as: "up" }],
    }
    await storage.runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-fail",
        execution: { path: null, manifestHash: "h" },
        status: "running",
        input: {},
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        plugins: {},
        host: { version: "0", pid: 1, mode: "in-process" },
        warnings: [],
        publishes: [],
      },
      manifest,
    )
    const outcome = await runExecution(manifest, {}, {
      capabilities,
      expression: engine,
      runId: "run-fail",
      store: storage.runs,
      call: async () => {
        throw Object.assign(new Error("missing file"), { code: "ECP_INPUT_INVALID" })
      },
    })
    expect(outcome.status).toBe("failed")
    const detail = await storage.runs.get("run-fail")
    expect(detail?.publishes).toEqual([])
  })

  it("allows unpublish before any publish, without a write", async () => {
    const store = fakeStore()
    const ledger = createPublishLedger(store, "run-1")
    await ledger.record(unpublishCap, "cleanup", undefined, { blobName: "x", container: "ecp" }, { deleted: true })
    expect(store.records).toEqual([])
    expect(store.writes).toBe(0)
  })

  it("keeps every entry when publish steps run at the same time", async () => {
    // A store that is slow and lets writes complete out of order, like parallel branches would see.
    const store = fakeStore({ delays: [30, 5, 15] })
    const ledger = createPublishLedger(store, "run-par")
    const publish = (blobName: string) =>
      ledger.record(
        publishCap,
        `up-${blobName}`,
        undefined,
        { file: { kind: "file", path: `/tmp/${blobName}` } },
        { file: { kind: "url", url: `https://blob.test/${blobName}` }, blobName, container: "ecp" },
      )
    await Promise.all([publish("a"), publish("b"), publish("c")])
    expect(store.records.map((entry) => entry.locator.blobName).sort()).toEqual(["a", "b", "c"])
    expect(store.reads).toBe(1)
  })

  it("loads existing entries once on a resumed run and closes them on unpublish", async () => {
    const existing: PublishRecord = {
      stepId: "up",
      round: null,
      capabilityId: publishCap.id,
      at: "2026-11-21T00:00:00.000Z",
      source: { kind: "file", path: "/tmp/a" },
      url: "https://blob.test/a",
      locator: { blobName: "a", container: "ecp" },
    }
    const store = fakeStore({ initial: [existing] })
    const ledger = createPublishLedger(store, "run-resume")
    await ledger.record(unpublishCap, "cleanup", undefined, { blobName: "a", container: "ecp" }, { deleted: true })
    expect(store.records[0]).toMatchObject({ deleteStepId: "cleanup", deletedAt: expect.any(String) })
  })
})

function fakeStore(options: { delays?: number[]; initial?: PublishRecord[] } = {}) {
  const delays = [...(options.delays ?? [])]
  const store = {
    records: [...(options.initial ?? [])] as PublishRecord[],
    reads: 0,
    writes: 0,
    async get() {
      store.reads += 1
      return { publishes: store.records } as never
    },
    async update(_id: string, patch: { publishes?: PublishRecord[] }) {
      const delay = delays.shift() ?? 0
      await new Promise((resolve) => setTimeout(resolve, delay))
      store.writes += 1
      if (patch.publishes) store.records = patch.publishes
    },
  }
  return store
}