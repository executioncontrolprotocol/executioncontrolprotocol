import type { PolicyDecision, PolicyLifecycleEvent } from "@executioncontrolprotocol/types"
import type { HookDefinition } from "../definitions/types.js"
import type { PolicyContext } from "./context.js"

/** Combine policy decisions per spec. */
export function combinePolicyDecisions(
  decisions: PolicyDecision[]
): PolicyDecision {
  if (decisions.some((d) => d.type === "deny")) {
    return decisions.find((d) => d.type === "deny")!
  }
  if (decisions.some((d) => d.type === "pause")) {
    return decisions.find((d) => d.type === "pause")!
  }
  const modify = decisions.filter((d) => d.type === "modify")
  if (modify.length > 0) return modify[0]!
  return { type: "allow" }
}

type PolicyHookEntry = {
  hook: HookDefinition
  config: Record<string, unknown>
}

/** Evaluate policy hooks for an event. */
export async function evaluatePolicies(
  event: PolicyLifecycleEvent,
  hooks: PolicyHookEntry[],
  ctx: PolicyContext
): Promise<PolicyDecision> {
  const relevant = hooks
    .filter((h) => h.hook.event === event)
    .sort((a, b) => (a.hook.priority ?? 0) - (b.hook.priority ?? 0))

  const decisions: PolicyDecision[] = []
  for (const { hook, config } of relevant) {
    const result = await hook.handler({
      event,
      workflow: ctx.workflow,
      run: ctx.run,
      step: ctx.step,
      state: ctx.state,
      input: ctx.input,
      output: ctx.output,
      usage: ctx.usage,
      mutableStateHandles: ctx.mutableStateHandles,
      pendingMutations: ctx.pendingMutations,
      proposedState: ctx.proposedState,
      scope: ctx.scope,
      operation: ctx.operation,
      registryRequest: ctx.registryRequest,
      config,
    } as import("./context.js").LifecycleContext & { config: Record<string, unknown> })
    if (result && typeof result === "object" && "type" in result) {
      decisions.push(result as PolicyDecision)
    }
  }
  if (decisions.length === 0) return { type: "allow" }
  return combinePolicyDecisions(decisions)
}
