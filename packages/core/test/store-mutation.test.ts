import { describe, expect, it, beforeEach } from "vitest"
import { extension, workflow, step, policy, state } from "../src/index.js"
import { createTestEnvironment } from "./helpers.js"
import {
  registerLifecycleSpyExtension,
  resetLifecycleSpy,
} from "../src/testing/test-lifecycle-extension.js"
import { registerStandardPolicies } from "@executioncontrolprotocol/policies"
import { createTransactionalStore, createMutationBuffer } from "../src/runtime/store.js"

describe("store mutations", () => {
  beforeEach(async () => {
    resetLifecycleSpy()
    await registerLifecycleSpyExtension()
    await registerStandardPolicies()
  })

  it("commits merge via state() handle after successful step", async () => {
    const env = (await createTestEnvironment("store-test")).withExtensions([
      extension("@executioncontrolprotocol/lifecycle-spy", "Spy").with({}),
    ])

    const manifest = workflow("Merge")
      .run([
        step("@executioncontrolprotocol/lifecycle-spy.merge-state", "Merge")
          .with({ target: state("target") })
          .as("result"),
      ])
      .toManifest()

    const ecp = await env.init()
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("completed")
    expect(result.state?.target).toEqual({ merged: true })
    const stepId = Object.keys(result.history ?? {})[0]!
    const record = result.history?.[stepId]
    expect(record?.mutations?.length).toBeGreaterThan(0)
    expect(record?.mutations?.[0]?.status).toBe("committed")
  })

  it("rejects store write without state() handle in step input", async () => {
    const s: Record<string, unknown> = {}
    const buffer = createMutationBuffer(s, new Set())
    const store = createTransactionalStore({
      state: s,
      buffer,
      allowedHandles: new Set(),
    })
    await expect(
      store.set("raw-path", { x: 1 })
    ).rejects.toThrow(/requires a state\(\) handle/)
  })

  it("state-control policy denies disallowed mutable path", async () => {
    const env = (await createTestEnvironment("store-policy"))
      .withExtensions([extension("@executioncontrolprotocol/lifecycle-spy", "Spy").with({})])
      .withPolicies([
        policy("@executioncontrolprotocol/state-control").with({
          allowedMutablePaths: ["allowed"],
        }),
      ])

    const manifest = workflow("Denied path")
      .run([
        step("@executioncontrolprotocol/lifecycle-spy.merge-state", "Merge")
          .with({ target: state("forbidden") })
          .as("result"),
      ])
      .toManifest()

    const ecp = await env.init()
    const result = await ecp.run(manifest)
    const stepId = Object.keys(result.history ?? {})[0]!
    expect(result.history?.[stepId]?.status).toBe("failed")
    expect(result.state?.forbidden).toBeUndefined()
  })
})
