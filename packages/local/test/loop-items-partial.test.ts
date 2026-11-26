import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { LocalRunStore } from "../src/storage/run-store.js"
import { HomePaths } from "../src/storage/paths.js"

describe("loop-items partial file", () => {
  it("writes and reads partial results atomically", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "ecp-loop-items-"))
    try {
      const paths = new HomePaths(home)
      const store = new LocalRunStore(paths, () => {})
      await store.create(
        {
          id: "run-1",
          schema: "@executioncontrolprotocol.run",
          version: "1.0",
          status: "running",
          startedAt: new Date().toISOString(),
          execution: { path: null, manifestHash: "h" },
          host: { version: "0", pid: 1, mode: "in-process" },
        },
        { schema: "@executioncontrolprotocol.execution", version: "2.0", steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo" }] },
      )
      await store.writeLoopPartial("run-1", "items", { rounds: { "0": { out: { ok: true } } }, errors: [] })
      const read = await store.readLoopPartial("run-1", "items")
      expect(read?.rounds["0"]).toEqual({ out: { ok: true } })
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})