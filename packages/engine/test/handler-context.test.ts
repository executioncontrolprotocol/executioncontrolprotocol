import { describe, expect, it, vi } from "vitest"
import { createHandlerContext, deepFreeze } from "../src/index.js"

describe("createHandlerContext", () => {
  it("deep-freezes state and wires injected services", async () => {
    const state = { count: 1, nested: { ok: true } }
    const usage = vi.fn()
    const call = vi.fn(async () => ({ echo: "nested" }))
    const ctx = createHandlerContext({
      config: { secret: "x" },
      signal: new AbortController().signal,
      init: { runId: "run-1", stepId: "step-1", round: 2, state },
      store: {
        set() {},
        merge() {},
        append() {},
      },
      deps: {
        files: (() => {
          const read = async () => ({ bytes: new Uint8Array([9]), mediaType: "text/plain", name: "a.txt" })
          const fromBytes = async (bytes: Uint8Array, options?: { mediaType?: string; name?: string }) => ({
            kind: "artifact" as const,
            uri: `ecp://runs/run-1/artifacts/${options?.name ?? "out"}`,
            mediaType: options?.mediaType,
            name: options?.name,
            sizeBytes: bytes.byteLength,
          })
          return {
            read: (_ref: { kind: "file"; path: string }) => read(),
            bytes: (_ref: { kind: "file"; path: string }) => read(),
            stream: async () => {
              const loaded = await read()
              return {
                stream: new ReadableStream({
                  start(c) {
                    c.enqueue(loaded.bytes)
                    c.close()
                  },
                }),
                async cancel() {},
              }
            },
            path: async () => ({ path: "/tmp/a.txt", temporary: false }),
            url: async (ref: { kind: "url"; url: string }) => ref,
            fromBytes,
            fromStream: async (stream: ReadableStream<Uint8Array>, options?: { mediaType?: string; name?: string }) => {
              const reader = stream.getReader()
              const { value } = await reader.read()
              return fromBytes(value ?? new Uint8Array(), options)
            },
            fromPath: async () => ({ kind: "artifact" as const, uri: "ecp://runs/run-1/artifacts/x" }),
            fromUrl: async (url: string) => ({ kind: "url" as const, url }),
            writeArtifact: (bytes: Uint8Array, options: { mediaType: string; name?: string }) =>
              fromBytes(bytes, options),
          }
        })(),
        call,
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        usage: { record: usage },
      },
    })

    expect(ctx.run).toEqual({ id: "run-1" })
    expect(ctx.step).toEqual({ id: "step-1", round: 2 })
    expect(Object.isFrozen(ctx.state)).toBe(true)
    expect(Object.isFrozen(ctx.state.nested)).toBe(true)
    expect(() => {
      ;(ctx.state as { count: number }).count = 2
    }).toThrow()

    const read = await ctx.files.read({ kind: "file", path: "/tmp/a.txt" })
    expect(read.bytes).toEqual(new Uint8Array([9]))
    const artifact = await ctx.files.writeArtifact(read.bytes, { mediaType: "text/plain", name: "out.txt" })
    expect(artifact.uri).toContain("out.txt")

    await expect(ctx.call("@executioncontrolprotocol/test.echo", { value: "x" })).resolves.toEqual({ echo: "nested" })
    expect(call).toHaveBeenCalled()
    ctx.usage.record({ kind: "tokens", amount: 3, unit: "count" })
    expect(usage).toHaveBeenCalledWith({ kind: "tokens", amount: 3, unit: "count" })
  })

  it("deepFreeze is idempotent on already frozen values", () => {
    const value = Object.freeze({ a: 1 })
    expect(deepFreeze(value)).toBe(value)
    expect(deepFreeze(null)).toBeNull()
    expect(deepFreeze(4)).toBe(4)
  })
})
