import { describe, it, beforeEach, expect } from "vitest"
import type { Environment } from "../src/environment/environment.js"
import {
  workflow,
  step,
  extension,
  policy,
  testExtension,
  lifecycleSpyExtension,
} from "../src/index.js"
import {
  lifecycleSpyEvents,
  resetLifecycleSpy,
} from "../src/testing/test-lifecycle-extension.js"
import { approvalPolicy } from "@executioncontrolprotocol/plugin-approval"
/**
 * Register shared runtime conformance tests for an environment factory.
 * @category Testing
 */
export function registerEnvironmentConformanceTests(
  suiteName: string,
  createEnv: () => Environment | Promise<Environment>
): void {
  describe(`${suiteName} runtime conformance`, () => {
    beforeEach(() => {
      resetLifecycleSpy()
    })

    it("runs echo and commits .as() output", async () => {
      const env = await createEnv()
      env.addExtensionBinding(testExtension)
      const manifest = workflow("Echo")
        .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "x" }).as("echo")])
        .toManifest()
      const ecp = await env.init()
      const result = await ecp.run(manifest)
      expect(result.run.status).toBe("completed")
      expect(result.state.echo).toEqual({ echo: "x" })
    })

    it("policy:pre deny skips capability invocation", async () => {
      const env = await createEnv()
      env.with([
        extension(testExtension),
        extension(lifecycleSpyExtension),
        policy(approvalPolicy).with({
          requireApprovalFor: ["@executioncontrolprotocol/test.echo"],
        }),
      ])
      lifecycleSpyEvents.length = 0
      const manifest = workflow("Deny")
        .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: 1 }).as("out")])
        .toManifest()
      const ecp = await env.init()
      const result = await ecp.run(manifest)
      expect(result.history?.out?.status ?? result.history?.echo?.status).toBe("paused")
      expect(lifecycleSpyEvents).not.toContain("step:started")
    })
  })
}
