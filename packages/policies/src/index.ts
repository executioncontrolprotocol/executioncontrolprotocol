import type { PolicyContext } from "@executioncontrolprotocol/core"
import type { PolicyDecision } from "@executioncontrolprotocol/types"
import { definePolicy, hook, globalRegistry } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { registerRegistryControlPolicy } from "./registry-control.js"

type PolicyHookFn = (
  ctx: PolicyContext & { config: Record<string, unknown> }
) => PolicyDecision | void | Promise<PolicyDecision | void>

function policyHook(
  event: import("@executioncontrolprotocol/types").PolicyLifecycleEvent,
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

/** @executioncontrolprotocol/approval policy. @category Policies */
export const approvalPolicy = definePolicy("@executioncontrolprotocol", "approval")
  .withConfig({
    requireApprovalFor: z.array(z.string()).default([]),
  })
  .withHooks([
    policyHook("policy:pre", (ctx) => {
      const list = (ctx.config.requireApprovalFor as string[]) ?? []
      if (list.includes(ctx.step.capabilityId)) {
        return { type: "pause", reason: "Approval required" }
      }
      return { type: "allow" }
    }),
  ])
  .build()

type MutationOp = "set" | "replace" | "merge" | "append"

/** Whether `path` is covered by `prefix` (exact or dotted descendant). */
function pathMatches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`)
}

/** @executioncontrolprotocol/state-control policy. @category Policies */
export const stateControlPolicy = definePolicy("@executioncontrolprotocol", "state-control")
  .withConfig({
    allowedMutablePaths: z.array(z.string()).optional(),
    deniedMutablePaths: z.array(z.string()).optional(),
    allowedMutationOps: z
      .array(z.enum(["set", "replace", "merge", "append"]))
      .optional(),
    requireReason: z.boolean().optional(),
    maxMutationsPerStep: z.number().optional(),
  })
  .withHooks([
    policyHook("policy:pre", (ctx) => {
      const denied = ctx.config.deniedMutablePaths as string[] | undefined
      const allowed = ctx.config.allowedMutablePaths as string[] | undefined
      for (const h of ctx.mutableStateHandles ?? []) {
        const path = typeof h === "string" ? h : h.path
        // Denied paths win over allowed paths.
        if (denied?.some((d) => pathMatches(path, d))) {
          return {
            type: "deny",
            reason: `Mutable path is denied: ${path}`,
            code: "STATE_PATH_DENIED",
          }
        }
        if (allowed && !allowed.some((a) => pathMatches(path, a))) {
          return {
            type: "deny",
            reason: `Mutable path not allowed: ${path}`,
            code: "STATE_PATH_NOT_ALLOWED",
          }
        }
      }
      return { type: "allow" }
    }),
    policyHook("policy:post", (ctx) => {
      const pending = ctx.pendingMutations ?? []

      const max = ctx.config.maxMutationsPerStep as number | undefined
      if (max !== undefined && pending.length > max) {
        return {
          type: "deny",
          reason: `Too many mutations in step: ${pending.length} of ${max}`,
          code: "STATE_MAX_MUTATIONS",
        }
      }

      const allowedOps = ctx.config.allowedMutationOps as MutationOp[] | undefined
      if (allowedOps) {
        const disallowed = pending.find((m) => !allowedOps.includes(m.op))
        if (disallowed) {
          return {
            type: "deny",
            reason: `Mutation op not allowed: ${disallowed.op}`,
            code: "STATE_OP_NOT_ALLOWED",
          }
        }
      }

      if (ctx.config.requireReason === true) {
        const missing = pending.find((m) => !m.reason || m.reason.trim() === "")
        if (missing) {
          return {
            type: "deny",
            reason: `Mutation to '${missing.path}' requires a reason`,
            code: "STATE_REASON_REQUIRED",
          }
        }
      }

      return { type: "allow" }
    }),
  ])
  .build()

export {
  registryControlPolicy,
  registerRegistryControlPolicy,
  REGISTRY_CONTROL_POLICY_ID,
  type RegistryControlPolicyConfig,
} from "./registry-control.js"
export {
  imagePolicy,
  evaluateImageRefsPre,
  evaluateImageRefsPost,
  registerImagePolicy,
  type ImagePolicyConfig,
} from "./image-policy.js"

/** Register all standard policies. @category Policies */
export async function registerStandardPolicies(registry = globalRegistry): Promise<void> {
  if (!registry.getPolicy("@executioncontrolprotocol/budget")) {
    await registry.registerPolicy(budgetPolicy)
  }
  if (!registry.getPolicy("@executioncontrolprotocol/approval")) {
    await registry.registerPolicy(approvalPolicy)
  }
  if (!registry.getPolicy("@executioncontrolprotocol/state-control")) {
    await registry.registerPolicy(stateControlPolicy)
  }
  await registerRegistryControlPolicy(registry)
}
