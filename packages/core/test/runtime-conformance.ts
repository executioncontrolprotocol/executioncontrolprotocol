import { describe, it, beforeEach, expect } from "vitest"
import type { Environment } from "../src/environment/environment.js"
import { workflow, step } from "../src/index.js"
import {
  registerLifecycleSpyExtension,
  lifecycleSpyEvents,
  resetLifecycleSpy,
} from "../src/testing/test-lifecycle-extension.js"
/**
 * Register shared runtime conformance tests for an environment factory.
 * @category Testing
 */
export function registerRuntimeConformanceTests(
  suiteName: string,
  createEnv: () => Promise<Environment>
): void {
  describe(`${suiteName} runtime conformance`, () => {
    beforeEach(async () => {
      resetLifecycleSpy()
      await registerLifecycleSpyExtension()
    })

    it("runs echo and commits .as() output", async () => {
      const env = await createEnv()
      env.addExtensionBinding("@executioncontrolprotocol/test", {})
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
      env.addExtensionBinding("@executioncontrolprotocol/test", {})
      env.addExtensionBinding("@executioncontrolprotocol/lifecycle-spy", {})
      env.addPolicyBinding("@executioncontrolprotocol/approval", { requireApprovalFor: ["@executioncontrolprotocol/test.echo"] })
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
