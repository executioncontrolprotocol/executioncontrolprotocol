import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { discoverOps, retryOnceIfHostStops } from "../src/lib/host-discovery.js"

const pluginTestRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../plugins/plugin-test",
)

describe("host discovery", () => {
  it("falls back to in-process and closes cleanly", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "ecp-cli-discover-"))
    try {
      const ops = await discoverOps({
        home,
        extraPlugins: [pluginTestRoot],
        autoStart: false,
      })
      expect(ops.mode).toBe("in-process")
      const result = await ops.retrieve({ type: "capability", query: "echo", limit: 5 })
      expect(result.ok).toBe(true)
      await ops.close()
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 60_000)
})

describe("retryOnceIfHostStops", () => {
  const ok = <D>(data: D) => ({ ok: true as const, data })
  const restarting = { ok: false as const, error: { code: "ECP_HOST_RESTARTING" as const, message: "draining" } }

  function fakeOps(responses: unknown[], mode: "http" | "in-process" = "http") {
    const calls: string[] = []
    let closed = 0
    const next = async (name: string) => {
      calls.push(name)
      const value = responses.shift()
      if (value instanceof Error) throw value
      return value as never
    }
    return {
      calls,
      closedCount: () => closed,
      ops: {
        mode,
        retrieve: () => next("retrieve"),
        execute: () => next("execute"),
        commit: () => next("commit"),
        close: async () => {
          closed += 1
        },
      },
    }
  }

  it("resends once on a fresh host when the first host is draining", async () => {
    const first = fakeOps([restarting])
    const second = fakeOps([ok({ runId: "r1" })])
    const ops = retryOnceIfHostStops(first.ops as never, async () => second.ops as never)
    const response = await ops.execute({ execution: { path: "x" } } as never)
    expect(response).toEqual(ok({ runId: "r1" }))
    expect(first.calls).toEqual(["execute"])
    expect(second.calls).toEqual(["execute"])
    expect(second.closedCount()).toBe(1)
  })

  it("resends once after the connection drops", async () => {
    const first = fakeOps([Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })])
    const second = fakeOps([ok({ items: [] })])
    const ops = retryOnceIfHostStops(first.ops as never, async () => second.ops as never)
    expect(await ops.retrieve({ type: "capability" } as never)).toEqual(ok({ items: [] }))
  })

  it("does not retry other errors and retries at most once", async () => {
    const other = { ok: false as const, error: { code: "ECP_NOT_FOUND" as const, message: "nope" } }
    const first = fakeOps([other])
    let rediscovered = 0
    const ops = retryOnceIfHostStops(first.ops as never, async () => {
      rediscovered += 1
      return fakeOps([restarting]).ops as never
    })
    expect(await ops.commit({} as never)).toEqual(other)
    expect(rediscovered).toBe(0)

    const again = retryOnceIfHostStops(fakeOps([restarting]).ops as never, async () => {
      rediscovered += 1
      return fakeOps([restarting]).ops as never
    })
    expect(await again.execute({} as never)).toEqual(restarting)
    expect(rediscovered).toBe(1)
  })
})
