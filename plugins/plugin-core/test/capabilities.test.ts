import { describe, expect, it } from "vitest"
import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import transformHandler from "../src/capabilities/transform.js"
import plugin from "../src/index.js"

function ctx(partial: Partial<HandlerContext> = {}): HandlerContext {
  return {
    config: undefined,
    signal: new AbortController().signal,
    run: { id: "run-1" },
    step: { id: "step-1" },
    state: Object.freeze({}),
    store: { set() {}, merge() {}, append() {} },
    files: {
      async read() {
        return { bytes: new Uint8Array(), mediaType: "application/octet-stream" }
      },
      async writeArtifact(bytes, options) {
        return {
          kind: "artifact",
          uri: `ecp://runs/run-1/artifacts/${options.name ?? "out"}`,
          mediaType: options.mediaType,
        }
      },
    },
    async call() {
      return undefined
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    usage: { record() {} },
    ...partial,
  }
}

describe("@executioncontrolprotocol/plugin-core", () => {
  it("declares transform as a step-contract script capability", () => {
    expect(plugin.id).toBe("@executioncontrolprotocol/core")
    const def = plugin.capabilities.transform
    expect(def.contract).toBe("step")
    expect(def.code).toBe("script")
  })

  it("handler throws ECP_STEP_FAILED if invoked", async () => {
    await expect(transformHandler({}, ctx())).rejects.toMatchObject({ code: "ECP_STEP_FAILED" })
  })

  it("default export matches the bundled plugin id", async () => {
    const mod = await import("../src/index.js")
    expect(mod.default.id).toBe("@executioncontrolprotocol/core")
    expect(mod.default.capabilities.transform.summary).toContain("transform")
  })

  it("lazy-loads the transform handler module", async () => {
    const loaded = await plugin.capabilities.transform.handler()
    expect(loaded.default).toBe(transformHandler)
  })
})