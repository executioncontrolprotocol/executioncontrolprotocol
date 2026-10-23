import { describe, expect, it, beforeEach } from "vitest"
import { z } from "zod"
import {
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
import { approvalPolicy } from "@executioncontrolprotocol/policies"

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
  })
})
