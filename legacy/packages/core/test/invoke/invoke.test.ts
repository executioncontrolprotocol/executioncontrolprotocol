import { describe, expect, it } from "vitest"
import {
  hook,
  defineExtension,
  definePolicy,
  capabilityFor,
  policy,
} from "../../src/index.js"
import { z } from "zod"
import { createTestEnvironment } from "../helpers.js"

describe("ecp.invoke", () => {
  it("invokes a registered capability with validated input and output", async () => {
    const echo = defineExtension("@executioncontrolprotocol", "invoke-echo")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/invoke-echo", "ping")
          .withInput(z.object({ message: z.string() }))
          .withOutput(z.object({ text: z.string() }))
          .withHandler(async (input) => ({ text: input.message })),
      ])
      .build()

    const ecp = await (await createTestEnvironment("invoke-test")).init()
    await ecp.getRegistry().registerExtension(echo)
    const result = await ecp.invoke("@executioncontrolprotocol/invoke-echo.ping").with({ message: "hi" }).process()
    expect(result.success).toBe(true)
    expect(result.result).toEqual({ text: "hi" })
    await ecp.terminate()
  })

  it("returns failure when capability is missing", async () => {
    const ecp = await (await createTestEnvironment("invoke-missing")).init()
    const result = await ecp.invoke("@executioncontrolprotocol/missing.cap").with({}).process()
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe("ECP_CAPABILITY_UNKNOWN")
    await ecp.terminate()
  })

  it("does not emit run lifecycle hooks", async () => {
    const events: string[] = []
    const spy = defineExtension("@executioncontrolprotocol", "invoke-spy")
      .withHooks([
        hook("run:before", async () => {
          events.push("run:before")
        }),
      ])
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/invoke-spy", "noop")
          .withInput(z.object({}))
          .withOutput(z.object({ ok: z.boolean() }))
          .withHandler(async () => ({ ok: true })),
      ])
      .build()

    const ecp = await (await createTestEnvironment("invoke-spy")).init()
    await ecp.getRegistry().registerExtension(spy)
    await ecp.invoke("@executioncontrolprotocol/invoke-spy.noop").with({}).process()
    expect(events).not.toContain("run:before")
    await ecp.terminate()
  })

  it("policy denies invoke", async () => {
    const denyPolicy = definePolicy("@executioncontrolprotocol", "invoke-scope-deny")
      .withHooks([
        hook("policy:pre", (ctx) => {
          if (ctx.scope === "invoke") {
            return { type: "deny", reason: "invoke blocked" }
          }
          return { type: "allow" }
        }),
      ])
      .build()
    const env = createTestEnvironment("invoke-deny-test").with([
      policy(denyPolicy).with({}),
    ])
    const ecp = await env.init()
    const result = await ecp.invoke("@executioncontrolprotocol/test.echo").with({ value: "x" }).process()
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe("ECP_POLICY_DENIED")
    await ecp.terminate()
  })

  it("copies thrown error fields onto diagnostics and keeps handler output", async () => {
    class HttpErr extends Error {
      status = 400
      bodyText = '{"error":"bad"}'
      url = "https://example.test/v1/jobs"
      output = { partial: true }

      constructor() {
        super("HTTP 400 for https://example.test/v1/jobs")
        this.name = "HttpErr"
      }
    }

    const boom = defineExtension("@executioncontrolprotocol", "invoke-http-err")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/invoke-http-err", "call")
          .withInput(z.object({}))
          .withOutput(z.object({ ok: z.boolean() }))
          .withHandler(async () => {
            throw new HttpErr()
          }),
      ])
      .build()

    const ecp = await (await createTestEnvironment("invoke-http-err")).init()
    await ecp.getRegistry().registerExtension(boom)
    const result = await ecp
      .invoke("@executioncontrolprotocol/invoke-http-err.call")
      .with({})
      .process()
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe("ECP_STEP_FAILED")
    expect(result.diagnostics[0]?.details).toMatchObject({
      name: "HttpErr",
      status: 400,
      bodyText: '{"error":"bad"}',
      url: "https://example.test/v1/jobs",
    })
    expect(result.result).toEqual({ partial: true })
    await ecp.terminate()
  })

  it("keeps handler output when it fails the output schema", async () => {
    const odd = defineExtension("@executioncontrolprotocol", "invoke-bad-out")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/invoke-bad-out", "ping")
          .withInput(z.object({}))
          .withOutput(z.object({ text: z.string() }))
          .withHandler(async () => ({ text: 1 }) as { text: string }),
      ])
      .build()

    const ecp = await (await createTestEnvironment("invoke-bad-out")).init()
    await ecp.getRegistry().registerExtension(odd)
    const result = await ecp
      .invoke("@executioncontrolprotocol/invoke-bad-out.ping")
      .with({})
      .process()
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe("ECP_OUTPUT_INVALID")
    expect(result.result).toEqual({ text: 1 })
    await ecp.terminate()
  })
})
