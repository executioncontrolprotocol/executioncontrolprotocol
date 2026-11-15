import { describe, expect, it, vi } from "vitest"
import type { ArtifactFileRef, FileRef, HandlerContext, StateHandle } from "@executioncontrolprotocol/plugin-sdk"
import echo from "../src/capabilities/echo.js"
import fail from "../src/capabilities/fail.js"
import delay from "../src/capabilities/delay.js"
import stage from "../src/capabilities/stage.js"
import configEcho from "../src/capabilities/config-echo.js"
import fileRoundtrip from "../src/capabilities/file-roundtrip.js"
import call from "../src/capabilities/call.js"
import bounded from "../src/capabilities/bounded.js"
import plugin from "../src/index.js"

function ctx(partial: Partial<HandlerContext> = {}): HandlerContext {
  return {
    config: undefined,
    signal: new AbortController().signal,
    run: { id: "run-1" },
    step: { id: "step-1" },
    state: Object.freeze({}),
    store: {
      set() {},
      merge() {},
      append() {},
    },
    files: {
      async read() {
        return { bytes: new Uint8Array([1, 2, 3]), mediaType: "application/octet-stream", name: "in.bin" }
      },
      async writeArtifact(bytes, options): Promise<ArtifactFileRef> {
        return {
          kind: "artifact",
          uri: `ecp://runs/run-1/artifacts/${options.name ?? "out.bin"}`,
          mediaType: options.mediaType,
          name: options.name,
          sizeBytes: bytes.byteLength,
        }
      },
    },
    async call() {
      return { echo: "nested" }
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    usage: { record() {} },
    ...partial,
  }
}

describe("plugin-test capabilities", () => {
  it("defines the eight capabilities from the spec", () => {
    expect(Object.keys(plugin.capabilities).sort()).toEqual([
      "bounded",
      "call",
      "config-echo",
      "delay",
      "echo",
      "fail",
      "file-roundtrip",
      "stage",
    ])
  })

  it("echoes, fails, delays, stages, echoes config, round-trips files, calls and bounds", async () => {
    await expect(bounded({ text: "ok" }, ctx())).resolves.toEqual({ text: "ok" })
    await expect(echo({ value: "hi" }, ctx())).resolves.toEqual({ echo: "hi" })

    await expect(fail({ code: "ECP_STEP_FAILED", message: "boom" }, ctx())).rejects.toMatchObject({
      code: "ECP_STEP_FAILED",
      message: "boom",
    })

    const delayed = delay({ ms: 5 }, ctx())
    await expect(delayed).resolves.toEqual({ waitedMs: 5 })

    const writes: Array<{ op: string; path: string; value: unknown }> = []
    await expect(
      stage(
        { handle: { $state: "history" }, op: "append", value: "note" },
        ctx({
          store: {
            set(handle: StateHandle, value) {
              writes.push({ op: "set", path: handle.path, value })
            },
            merge(handle, value) {
              writes.push({ op: "merge", path: handle.path, value })
            },
            append(handle, value) {
              writes.push({ op: "append", path: handle.path, value })
            },
          },
        }),
      ),
    ).resolves.toEqual({ ok: true })
    expect(writes).toEqual([{ op: "append", path: "history", value: "note" }])

    await expect(
      configEcho({}, ctx({ config: { secret: "abc", label: "x" } })),
    ).resolves.toEqual({ keys: ["secret", "label"], secretLength: 3 })

    const file: FileRef = { kind: "file", path: "/tmp/in.bin" }
    const round = await fileRoundtrip({ file }, ctx())
    expect(round.artifact.kind).toBe("artifact")
    expect(round.artifact.uri).toContain("ecp://runs/run-1/artifacts/")

    const nested = vi.fn(async () => ({ echo: "nested" }))
    await expect(
      call({ capabilityId: "@executioncontrolprotocol/test.echo", input: { value: "x" } }, ctx({ call: nested })),
    ).resolves.toEqual({ result: { echo: "nested" } })
    expect(nested).toHaveBeenCalledWith("@executioncontrolprotocol/test.echo", { value: "x" }, {})
  })

  it("honours abort on delay", async () => {
    const controller = new AbortController()
    const pending = delay({ ms: 5_000 }, ctx({ signal: controller.signal }))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })

  it("stages set and merge, rejects bad merge values, and fails when asked", async () => {
    const writes: Array<{ op: string; path: string; value: unknown }> = []
    const store = {
      set(handle: StateHandle, value: unknown) {
        writes.push({ op: "set", path: handle.path, value })
      },
      merge(handle: StateHandle, value: Record<string, unknown>) {
        writes.push({ op: "merge", path: handle.path, value })
      },
      append(handle: StateHandle, value: unknown) {
        writes.push({ op: "append", path: handle.path, value })
      },
    }
    await expect(
      stage({ handle: {}, op: "set", value: 1 }, ctx({ store })),
    ).resolves.toEqual({ ok: true })
    await expect(
      stage({ handle: { $state: "doc" }, op: "merge", value: { a: 1 } }, ctx({ store })),
    ).resolves.toEqual({ ok: true })
    await expect(
      stage({ handle: { $state: "doc" }, op: "merge", value: "nope" }, ctx({ store })),
    ).rejects.toMatchObject({ code: "ECP_STEP_FAILED" })
    await expect(
      stage({ handle: { $state: "doc" }, op: "append", value: "x", fail: true }, ctx({ store })),
    ).rejects.toMatchObject({ code: "ECP_STEP_FAILED", message: "stage failed" })
    expect(writes).toEqual([
      { op: "set", path: "history", value: 1 },
      { op: "merge", path: "doc", value: { a: 1 } },
      { op: "append", path: "doc", value: "x" },
    ])
  })

  it("loads every capability handler through its lazy thunk", async () => {
    for (const capability of Object.values(plugin.capabilities)) {
      const mod = await capability.handler()
      expect(typeof mod.default).toBe("function")
    }
  })

  it("covers default branches for fail, delay, config-echo, call and files", async () => {
    await expect(echo({}, ctx())).resolves.toEqual({ echo: null })
    await expect(fail({}, ctx())).rejects.toMatchObject({
      code: "ECP_STEP_FAILED",
      message: "failed",
    })

    const already = new AbortController()
    already.abort()
    await expect(delay({ ms: 10 }, ctx({ signal: already.signal }))).rejects.toMatchObject({
      name: "AbortError",
    })

    await expect(configEcho({}, ctx({ config: undefined }))).resolves.toEqual({
      keys: [],
      secretLength: 0,
    })

    const nested = vi.fn(async () => ({ ok: true }))
    await expect(
      call({ capabilityId: "@executioncontrolprotocol/test.echo" }, ctx({ call: nested })),
    ).resolves.toEqual({ result: { ok: true } })
    expect(nested).toHaveBeenCalledWith("@executioncontrolprotocol/test.echo", {}, {})

    const round = await fileRoundtrip(
      { file: { kind: "file", path: "/tmp/in.bin" } },
      ctx({
        files: {
          async read() {
            return { bytes: new Uint8Array([1]) }
          },
          async writeArtifact(bytes, options) {
            return {
              kind: "artifact",
              uri: "ecp://runs/run-1/artifacts/artifact.bin",
              mediaType: options.mediaType,
              name: options.name,
              sizeBytes: bytes.byteLength,
            }
          },
        },
      }),
    )
    expect(round.artifact.name).toBe("artifact.bin")

    await expect(
      stage({ handle: { $state: "doc" }, op: "merge", value: [1] }, ctx()),
    ).rejects.toMatchObject({ code: "ECP_STEP_FAILED" })
  })
})
