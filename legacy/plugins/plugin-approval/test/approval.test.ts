import { describe, expect, it } from "vitest"
import { Registry } from "@executioncontrolprotocol/core"
import type { PolicyContext } from "@executioncontrolprotocol/core"
import type { PolicyDecision } from "@executioncontrolprotocol/core/types"
import { approvalPolicy } from "../src/index.js"

describe("@executioncontrolprotocol/approval", () => {
  it("registers the default-exported definition", async () => {
    const registry = new Registry()
    await registry.registerPolicy(approvalPolicy)
    expect(registry.getPolicy("@executioncontrolprotocol/approval")).toBe(approvalPolicy)
  })

  it("pauses when the capability is listed and no approval is recorded", async () => {
    const hook = approvalPolicy.hooks.find((h) => h.event === "policy:pre")
    if (!hook) throw new Error("missing policy:pre")
    const ctx = {
      config: { requireApprovalFor: ["@executioncontrolprotocol/test.echo"] },
      step: { id: "echo", capabilityId: "@executioncontrolprotocol/test.echo" },
      approvals: [],
    } as unknown as PolicyContext & { config: Record<string, unknown> }
    const decision = (await hook.handler(ctx)) as PolicyDecision
    expect(decision).toEqual({ type: "pause", reason: "Approval required" })
  })

  it("allows when an approval is recorded for the step", async () => {
    const hook = approvalPolicy.hooks.find((h) => h.event === "policy:pre")
    if (!hook) throw new Error("missing policy:pre")
    const ctx = {
      config: { requireApprovalFor: ["@executioncontrolprotocol/test.echo"] },
      step: { id: "echo", capabilityId: "@executioncontrolprotocol/test.echo" },
      approvals: [{ stepId: "echo" }],
    } as unknown as PolicyContext & { config: Record<string, unknown> }
    const decision = (await hook.handler(ctx)) as PolicyDecision
    expect(decision).toEqual({ type: "allow" })
  })
})
