import { describe, expect, it, beforeEach } from "vitest"
import { registerMemoryExtension } from "../src/index.js"
import { globalRegistry } from "@executioncontrolprotocol/core"

describe("@executioncontrolprotocol/memory hooks", () => {
  beforeEach(() => {
    registerMemoryExtension()
  })

  it("step:completed hook stores output", async () => {
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/memory")
    const hookDef = ext?.hooks.find((h) => h.event === "step:completed")
    await hookDef?.handler({
      event: "step:completed",
      workflow: { version: "1.0.0", steps: [] },
      run: { id: "r1", input: {} },
      step: { id: "s1", capabilityId: "@executioncontrolprotocol/test" },
      state: {},
      output: { ok: true },
    } as never)
    const search = ext?.capabilities.find((c) => c.id === "@executioncontrolprotocol/memory.search")
    const found = await search?.handler({ query: "ok" }, {} as never)
    expect((found as { results: unknown[] }).results.length).toBeGreaterThan(0)
  })
})
