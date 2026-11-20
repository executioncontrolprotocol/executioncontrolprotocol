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

describe("@executioncontrolprotocol/plugin-jsonata", () => {
  it("declares transform as a step-contract expression capability", () => {
    expect(plugin.id).toBe("@executioncontrolprotocol/jsonata")
    const def = plugin.capabilities.transform
    expect(def.contract).toBe("step")
    expect(def.code).toBe("expression")
    expect(def.timeoutMs).toBe(1000)
  })

  it("evaluates JSONata against input", async () => {
    const output = await transformHandler(
      { people: [{ name: "Ada" }, { name: "Grace" }] },
      ctx({ expression: '{ "names": people.name }' }),
    )
    expect(output).toEqual({ names: ["Ada", "Grace"] })
  })

  it("fails when expression is missing", async () => {
    await expect(transformHandler({}, ctx())).rejects.toMatchObject({ code: "ECP_STEP_FAILED" })
  })

  it("surfaces JSONata syntax errors with position", async () => {
    await expect(transformHandler({ x: 1 }, ctx({ expression: "{" }))).rejects.toMatchObject({
      code: "ECP_STEP_FAILED",
      message: expect.stringMatching(/position/i),
    })
  })

  it("fails with ECP_STEP_TIMEOUT when the step signal is aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      transformHandler({ x: 1 }, ctx({ expression: "x", signal: controller.signal })),
    ).rejects.toMatchObject({ code: "ECP_STEP_TIMEOUT" })
  })

  it("stops a runaway expression when the step signal aborts", async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 200)
    const started = Date.now()
    try {
      await expect(
        transformHandler(
          {},
          ctx({ expression: "( $loop := function($n) { $loop($n + 1) }; $loop(0) )", signal: controller.signal }),
        ),
      ).rejects.toMatchObject({ code: "ECP_STEP_TIMEOUT" })
    } finally {
      clearTimeout(timer)
    }
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it("fails an expression that exhausts the worker heap", async () => {
    await expect(
      transformHandler(
        {},
        ctx({ expression: "( $grow := function($a) { $grow($append($a, $a)) }; $grow([1,2,3,4,5,6,7,8]) )" }),
      ),
    ).rejects.toMatchObject({ code: "ECP_STEP_FAILED", message: "JSONata evaluation exceeded the memory limit." })
  }, 20_000)

  it("returns null when nothing matches", async () => {
    await expect(transformHandler({ x: 1 }, ctx({ expression: "missing" }))).resolves.toBeNull()
  })

  it("lazy-loads the transform handler module", async () => {
    const loaded = await plugin.capabilities.transform.handler()
    expect(loaded.default).toBe(transformHandler)
  })
})