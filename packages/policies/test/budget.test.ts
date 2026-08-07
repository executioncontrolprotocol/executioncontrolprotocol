import { describe, expect, it } from "vitest"
import { createUsageLedger } from "@executioncontrolprotocol/core"
import type { PolicyContext, UsageLedger } from "@executioncontrolprotocol/core"
import type { PolicyDecision, PolicyLifecycleEvent } from "@executioncontrolprotocol/types"
import { budgetPolicy } from "../src/index.js"

function ledger(values: Partial<Pick<UsageLedger, "modelCalls" | "costUsd" | "tokens" | "retries">>): UsageLedger {
  const l = createUsageLedger()
  l.increment(values)
  return l
}

async function evalBudget(
  event: PolicyLifecycleEvent,
  config: Record<string, unknown>,
  usage: UsageLedger
): Promise<PolicyDecision | void> {
  const hook = budgetPolicy.hooks.find((h) => h.event === event)
  if (!hook) throw new Error(`missing ${event}`)
  const ctx: PolicyContext & { config: Record<string, unknown> } = {
    workflow: { schema: "@executioncontrolprotocol.workflow", version: "1.0.0", workflow: { id: "stub" }, steps: [] },
    run: { id: "run", input: {} },
    step: { id: "s1", capabilityId: "@executioncontrolprotocol/test.echo" },
    state: {},
    input: {},
    usage,
    config,
  }
  return (await hook.handler(ctx as never)) as PolicyDecision | void
}

describe("@executioncontrolprotocol/budget enforcement", () => {
  it("allows when no limits are configured", async () => {
    const decision = await evalBudget("policy:pre", {}, ledger({ modelCalls: 100, costUsd: 9, tokens: 9999 }))
    expect(decision).toEqual({ type: "allow" })
  })

  it("policy:pre denies once model calls reach the limit (inclusive)", async () => {
    const decision = await evalBudget("policy:pre", { maxModelCalls: 2 }, ledger({ modelCalls: 2 }))
    expect(decision?.type).toBe("deny")
    expect((decision as { code?: string }).code).toBe("BUDGET_MODEL_CALLS")
  })

  it("policy:pre allows when model calls are still under the limit", async () => {
    const decision = await evalBudget("policy:pre", { maxModelCalls: 3 }, ledger({ modelCalls: 2 }))
    expect(decision).toEqual({ type: "allow" })
  })

  it("policy:post denies only when model calls exceed the limit", async () => {
    const atLimit = await evalBudget("policy:post", { maxModelCalls: 2 }, ledger({ modelCalls: 2 }))
    expect(atLimit).toEqual({ type: "allow" })
    const over = await evalBudget("policy:post", { maxModelCalls: 2 }, ledger({ modelCalls: 3 }))
    expect(over?.type).toBe("deny")
  })

  it("enforces maxCostUsd", async () => {
    const decision = await evalBudget("policy:pre", { maxCostUsd: 0.5 }, ledger({ costUsd: 0.5 }))
    expect(decision?.type).toBe("deny")
    expect((decision as { code?: string }).code).toBe("BUDGET_COST_USD")
  })

  it("enforces maxTokens", async () => {
    const decision = await evalBudget("policy:pre", { maxTokens: 1000 }, ledger({ tokens: 1500 }))
    expect(decision?.type).toBe("deny")
    expect((decision as { code?: string }).code).toBe("BUDGET_TOKENS")
  })

  it("enforces maxRetries", async () => {
    const decision = await evalBudget("policy:pre", { maxRetries: 2 }, ledger({ retries: 2 }))
    expect(decision?.type).toBe("deny")
    expect((decision as { code?: string }).code).toBe("BUDGET_RETRIES")
  })
})
