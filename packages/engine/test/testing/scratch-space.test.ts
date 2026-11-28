import { describe, expect, it } from "vitest"
import { MemoryScratchSpace } from "../../src/testing/scratch-space.js"

describe("MemoryScratchSpace", () => {
  it("stores bytes, streams, and copies in memory", async () => {
    const scratch = new MemoryScratchSpace()
    const label = await scratch.writeBytes("run-a", "step-1", "a.bin", new Uint8Array([1, 2]))
    expect(label).toBe("memory://run-a/step-1/a.bin")
    expect(scratch.read("run-a", "step-1", "a.bin")).toEqual(new Uint8Array([1, 2]))
    await scratch.writeStream("run-a", "step-2", "b.bin", new Response(new Uint8Array([3])).body!)
    expect(scratch.read("run-a", "step-2", "b.bin")).toEqual(new Uint8Array([3]))
    await scratch.copyFromPath("run-a", "step-1", "/ignored", "c.bin")
    expect(scratch.read("run-a", "step-1", "c.bin")).toEqual(new Uint8Array())
    expect(scratch.hasStep("run-a", "step-1")).toBe(true)
    await scratch.releaseStep("run-a", "step-1")
    expect(scratch.hasStep("run-a", "step-1")).toBe(false)
    expect(scratch.read("run-a", "step-1", "a.bin")).toBeUndefined()
  })

  it("rejects unsafe artifact names", async () => {
    const scratch = new MemoryScratchSpace()
    await expect(scratch.writeBytes("run-a", "s", "../x", new Uint8Array())).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
  })

  it("no-ops start and stop", async () => {
    const scratch = new MemoryScratchSpace()
    await expect(scratch.start()).resolves.toBeUndefined()
    await expect(scratch.stop()).resolves.toBeUndefined()
  })
})