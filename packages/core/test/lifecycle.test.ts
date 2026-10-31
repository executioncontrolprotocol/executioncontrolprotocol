import { describe, expect, it, beforeEach } from "vitest"
import { z } from "zod"
import {
  capabilityFor,
  defineExtension,
  extension,
  workflow,
  step,
  policy,
  definePolicy,
  hook,
} from "../src/index.js"
import { createTestEnvironment } from "./helpers.js"
import {
  lifecycleSpyExtension,
  resetLifecycleSpy,
  lifecycleSpyEvents,
  lifecycleSpyLastStepFailedDiagnostics,
  capabilityInvokeCount,
} from "../src/testing/test-lifecycle-extension.js"
import { approvalPolicy } from "@executioncontrolprotocol/plugin-approval"

async function testEnv(extraPolicies: ReturnType<typeof policy>[] = []) {
  const base = createTestEnvironment("lifecycle-test")
  return base
    .with([extension(lifecycleSpyExtension, "Spy").with({})])
    .with(extraPolicies)
}

describe("step lifecycle ordering", () => {
  beforeEach(() => {
    resetLifecycleSpy()
  })

  it("happy path emits step:before → step:started → step:completed → step:finally", async () => {
    const env = await testEnv()
    const manifest = workflow("Happy")
      .run([
        step("@executioncontrolprotocol/lifecycle-spy.echo", "Echo")
          .with({ value: "ok" })
          .as("echo"),
      ])
      .toManifest()

    const ecp = await env.init()
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("completed")
    expect(capabilityInvokeCount).toBe(1)
    expect(lifecycleSpyEvents).toEqual([
      "step:before",
      "step:started",
      "step:completed",
      "step:finally",
    ])
  })

  it("policy:pre deny skips step:started and capability", async () => {
    const denyPolicy = definePolicy("@executioncontrolprotocol", "deny-pre-test")
      .withConfig({ capabilityId: z.string() })
      .withHooks([
        hook("policy:pre", (ctx) => {
          const cfg = (ctx as { config?: Record<string, unknown> }).config
          if (ctx.step?.capabilityId === cfg?.capabilityId) {
            return { type: "deny", reason: "blocked" }
          }
          return { type: "allow" }
        }),
      ])
      .build()

    const env = await testEnv([
      policy(denyPolicy).with({ capabilityId: "@executioncontrolprotocol/lifecycle-spy.echo" }),
    ])
    resetLifecycleSpy()

    const manifest = workflow("Deny")
      .run([step("@executioncontrolprotocol/lifecycle-spy.echo", "Echo").with({ value: "x" })])
      .toManifest()

    const ecp = await env.init()
    const result = await ecp.run(manifest)
    expect(result.history?.echo?.status ?? Object.values(result.history ?? {})[0]?.status).toBe(
      "failed"
    )
    expect(capabilityInvokeCount).toBe(0)
    expect(lifecycleSpyEvents).toContain("step:before")
    expect(lifecycleSpyEvents).toContain("step:failed")
    expect(lifecycleSpyEvents).not.toContain("step:started")
    expect(lifecycleSpyEvents).toContain("step:finally")
    expect(lifecycleSpyLastStepFailedDiagnostics?.[0]?.message).toBe("blocked")
  })

  it("policy:pre pause skips capability and sets paused status", async () => {
    const env = await testEnv([
      policy(approvalPolicy).with({
        requireApprovalFor: ["@executioncontrolprotocol/lifecycle-spy.echo"],
      }),
    ])
    resetLifecycleSpy()

    const manifest = workflow("Pause")
      .run([step("@executioncontrolprotocol/lifecycle-spy.echo", "Echo").with({ value: "x" }).as("echo")])
      .toManifest()

    const ecp = await env.init()
    const result = await ecp.run(manifest)
    expect(result.history?.echo?.status).toBe("paused")
    expect(capabilityInvokeCount).toBe(0)
    expect(lifecycleSpyEvents).not.toContain("step:started")
    expect(lifecycleSpyEvents).toContain("step:finally")
  })

  it("capability throw emits step:failed and step:finally without commit", async () => {
    const env = await testEnv()
    const manifest = workflow("Throw")
      .run([
        step("@executioncontrolprotocol/lifecycle-spy.throw", "Throw").as("out"),
      ])
      .toManifest()

    const stateBefore = { seed: 1 }
    const ecp = await env.init()
    const result = await ecp.run(manifest, { input: stateBefore })
    expect(capabilityInvokeCount).toBe(1)
    expect(lifecycleSpyEvents).toContain("step:failed")
    expect(lifecycleSpyEvents).toContain("step:finally")
    expect(lifecycleSpyEvents).not.toContain("step:completed")
    expect(lifecycleSpyLastStepFailedDiagnostics?.[0]?.message).toBe("capability failed")
    expect(result.state?.seed).toBe(1)
    expect(result.state?.out).toBeUndefined()
    expect(result.history?.throw?.status).toBe("failed")
    expect(result.history?.throw?.diagnostics?.[0]?.code).toBe("ECP_STEP_FAILED")
  })

  it("failed step history keeps handler output and error details", async () => {
    class HttpErr extends Error {
      status = 502
      bodyText = '{"error":"upstream"}'
      output = { echoed: "x" }

      constructor() {
        super("HTTP 502")
        this.name = "HttpErr"
      }
    }

    const boom = defineExtension("@executioncontrolprotocol", "run-http-err")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/run-http-err", "call")
          .withInput(z.object({}))
          .withOutput(z.object({ echoed: z.string() }))
          .withHandler(async () => {
            throw new HttpErr()
          }),
      ])
      .build()

    const env = createTestEnvironment("run-http-err").with([extension(boom)])
    const manifest = workflow("Fail")
      .run([step("@executioncontrolprotocol/run-http-err.call", "Call").id("call").as("out")])
      .toManifest()
    const ecp = await env.init()
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("failed")
    expect(result.history?.call?.status).toBe("failed")
    expect(result.history?.call?.output).toEqual({ echoed: "x" })
    expect(result.history?.call?.diagnostics?.[0]?.details).toMatchObject({
      name: "HttpErr",
      status: 502,
      bodyText: '{"error":"upstream"}',
    })
    await ecp.terminate()
  })
})
