import type { PolicyContext } from "@executioncontrolprotocol/core"
import type { PolicyDecision } from "@executioncontrolprotocol/core/types"
import { definePolicy, hook } from "@executioncontrolprotocol/core"
import { z } from "zod"

type PolicyHookFn = (
  ctx: PolicyContext & { config: Record<string, unknown> }
) => PolicyDecision | void | Promise<PolicyDecision | void>

function policyHook(
  event: import("@executioncontrolprotocol/core/types").PolicyLifecycleEvent,
  fn: PolicyHookFn
) {
  return hook(event, (lifecycleCtx) =>
    fn(lifecycleCtx as unknown as PolicyContext & { config: Record<string, unknown> })
  )
}

/** @executioncontrolprotocol/approval policy. @category Policies */
export const approvalPolicy = definePolicy("@executioncontrolprotocol", "approval")
  .withConfig({
    requireApprovalFor: z.array(z.string()).default([]),
  })
  .withHooks([
    policyHook("policy:pre", (ctx) => {
      const list = (ctx.config.requireApprovalFor as string[]) ?? []
      if (!list.includes(ctx.step.capabilityId)) return { type: "allow" }
      const approved = ctx.approvals?.some((a) => a.stepId === ctx.step.id)
      if (approved) return { type: "allow" }
      return { type: "pause", reason: "Approval required" }
    }),
  ])
  .build()

export default approvalPolicy
