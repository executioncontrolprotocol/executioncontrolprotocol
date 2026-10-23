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

/** Budget dimensions enforced by the budget policy. */
const BUDGET_LIMITS = [
  { config: "maxModelCalls", usage: "modelCalls", code: "BUDGET_MODEL_CALLS", label: "model calls" },
  { config: "maxCostUsd", usage: "costUsd", code: "BUDGET_COST_USD", label: "cost (USD)" },
  { config: "maxTokens", usage: "tokens", code: "BUDGET_TOKENS", label: "tokens" },
  { config: "maxRetries", usage: "retries", code: "BUDGET_RETRIES", label: "retries" },
] as const

/**
 * Evaluate every configured budget dimension against the usage ledger.
 * `inclusive` denies when usage has already reached the limit (`policy:pre`,
 * before more work is done); otherwise denies only when the limit is exceeded
 * (`policy:post`, after work has completed).
 */
function evaluateBudget(
  config: Record<string, unknown>,
  usage: PolicyContext["usage"],
  inclusive: boolean
): PolicyDecision {
  for (const limit of BUDGET_LIMITS) {
    const max = config[limit.config] as number | undefined
    if (max === undefined) continue
    const used = usage[limit.usage]
    const overBudget = inclusive ? used >= max : used > max
    if (overBudget) {
      return {
        type: "deny",
        reason: `Budget exceeded for ${limit.label}: ${used} of ${max}`,
        code: limit.code,
      }
    }
  }
  return { type: "allow" }
}

/** @executioncontrolprotocol/budget policy definition. @category Policies */
export const budgetPolicy = definePolicy("@executioncontrolprotocol", "budget")
  .withConfig({
    maxCostUsd: z.number().optional(),
    maxModelCalls: z.number().optional(),
    maxRetries: z.number().optional(),
    maxTokens: z.number().optional(),
  })
  .withHooks([
    policyHook("policy:pre", (ctx) => evaluateBudget(ctx.config, ctx.usage, true)),
    policyHook("policy:post", (ctx) => evaluateBudget(ctx.config, ctx.usage, false)),
    // `policy:finally` cannot change the step outcome; it is reserved for
    // usage reconciliation/reporting. No-op until a reporting sink is bound.
    policyHook("policy:finally", () => undefined),
  ])
  .build()

export default budgetPolicy
