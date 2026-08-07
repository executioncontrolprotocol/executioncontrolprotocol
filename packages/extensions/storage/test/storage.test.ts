import { describe, expect, it, beforeEach } from "vitest"
import { registerStorageExtension, storageExtension } from "../src/index.js"
import { globalRegistry } from "@executioncontrolprotocol/core"

describe("@executioncontrolprotocol/storage", () => {
  beforeEach(() => {
    registerStorageExtension()
  })

  it("read/write round-trip", async () => {
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/storage")
    expect(ext).toBe(storageExtension)
    const write = ext?.capabilities.find((c) => c.id === "@executioncontrolprotocol/storage.write")
    const read = ext?.capabilities.find((c) => c.id === "@executioncontrolprotocol/storage.read")
    const ctx = { extensionConfig: {}, usage: { increment: () => undefined } }
    await write?.handler({ key: "a", value: { x: 1 } }, ctx as never)
    const out = await read?.handler({ key: "a" }, ctx as never)
    expect((out as { value: { x: number } }).value).toEqual({ x: 1 })
  })
})
