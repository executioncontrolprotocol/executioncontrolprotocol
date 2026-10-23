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

export default stateControlPolicy
