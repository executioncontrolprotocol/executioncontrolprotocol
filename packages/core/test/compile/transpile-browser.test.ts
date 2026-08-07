import { afterEach, describe, expect, it, vi } from "vitest"
import {
  isEsbuildAlreadyInitializedError,
  transpileWorkflowSource,
  unpkgEsbuildWasmUrl,
} from "../../src/compile/transpile-browser.js"

const ESBUILD_WASM_INIT_KEY = "__ecpEsbuildWasmInit"

function mockEsbuildWasm(overrides: {
  initialize?: ReturnType<typeof vi.fn>
  transform?: ReturnType<typeof vi.fn>
}) {
  const initialize = overrides.initialize ?? vi.fn().mockResolvedValue(undefined)
  const transform = overrides.transform ?? vi.fn().mockResolvedValue({ code: "export const x = 1" })
  const version = "0.25.12"
  return {
    default: { initialize, transform, version },
    initialize,
    transform,
    version,
  }
}

describe("isEsbuildAlreadyInitializedError", () => {
  it("matches esbuild initialize-once errors", () => {
    expect(isEsbuildAlreadyInitializedError(new Error("initialize can only be called once"))).toBe(
      true
    )
    expect(isEsbuildAlreadyInitializedError(new Error("already initialized"))).toBe(true)
  })

  it("does not match unrelated errors", () => {
    expect(isEsbuildAlreadyInitializedError(new Error("transform failed"))).toBe(false)
  })
})

describe("unpkgEsbuildWasmUrl", () => {
  it("pins wasm URL to host package version", () => {
    expect(unpkgEsbuildWasmUrl("0.25.12")).toBe(
      "https://unpkg.com/esbuild-wasm@0.25.12/esbuild.wasm"
    )
  })
})

describe("resolveEsbuildWasmInitializeUrl", () => {
  afterEach(() => {
    delete (globalThis as { __ecpEsbuildWasmUrl?: string }).__ecpEsbuildWasmUrl
  })

  it("uses global override when set", async () => {
    ;(globalThis as { __ecpEsbuildWasmUrl?: string }).__ecpEsbuildWasmUrl =
      "/assets/esbuild.wasm"
    const { resolveEsbuildWasmInitializeUrl } = await import(
      "../../src/compile/transpile-browser.js"
    )
    expect(resolveEsbuildWasmInitializeUrl({ version: "0.25.12" } as never)).toBe(
      "/assets/esbuild.wasm"
    )
  })
})

describe("esbuild-wasm init", () => {
  afterEach(() => {
    const globalRecord = globalThis as typeof globalThis & {
      [ESBUILD_WASM_INIT_KEY]?: { initPromise: unknown }
    }
    delete globalRecord[ESBUILD_WASM_INIT_KEY]
    vi.resetModules()
    vi.doUnmock("esbuild-wasm")
    vi.unstubAllGlobals()
  })

  it("concurrent transpile calls initialize only once", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined)
    const transform = vi.fn().mockResolvedValue({ code: "export const x = 1" })

    vi.doMock("esbuild-wasm", () => mockEsbuildWasm({ initialize, transform }))

    const { transpileWorkflowSource: transpile } = await import(
      "../../src/compile/transpile-browser.js"
    )

    await Promise.all([
      transpile("export const x = 1", "workflow.ts"),
      transpile("export const y = 2", "workflow.ts"),
      transpile("export const z = 3", "workflow.ts"),
    ])

    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it("warmBrowserWorkflowCompile initializes in browser context", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined)
    const transform = vi.fn().mockResolvedValue({ code: "export const x = 1" })

    vi.stubGlobal("window", {})
    vi.doMock("esbuild-wasm", () => mockEsbuildWasm({ initialize, transform }))

    const { warmBrowserWorkflowCompile: warm } = await import(
      "../../src/compile/transpile-browser.js"
    )

    await Promise.all([warm(), warm(), warm()])

    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it("swallows already-initialized rejection and still resolves", async () => {
    const initialize = vi
      .fn()
      .mockRejectedValueOnce(new Error("initialize can only be called once"))
    const transform = vi.fn().mockResolvedValue({ code: "export const x = 1" })

    vi.doMock("esbuild-wasm", () => mockEsbuildWasm({ initialize, transform }))

    const { warmBrowserWorkflowCompile: warm, transpileWorkflowSource: transpile } = await import(
      "../../src/compile/transpile-browser.js"
    )

    vi.stubGlobal("window", {})
    await warm()
    const code = await transpile("export const x = 1", "workflow.ts")
    expect(code).toBe("export const x = 1")
    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it("reuses global init promise across module reload simulation", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined)
    const transform = vi.fn().mockResolvedValue({ code: "export default {}" })

    vi.doMock("esbuild-wasm", () => mockEsbuildWasm({ initialize, transform }))

    const first = await import("../../src/compile/transpile-browser.js")
    await first.transpileWorkflowSource("export default {}", "workflow.ts")

    vi.resetModules()
    vi.doMock("esbuild-wasm", () => mockEsbuildWasm({ initialize, transform }))

    const second = await import("../../src/compile/transpile-browser.js")
    await second.transpileWorkflowSource("export default {}", "workflow.ts")

    expect(initialize).toHaveBeenCalledTimes(1)
  })
})

describe("transpileWorkflowSource", () => {
  it("returns non-TypeScript source unchanged without initializing esbuild", async () => {
    const code = await transpileWorkflowSource("export default {}", "workflow.js")
    expect(code).toBe("export default {}")
  })
})
