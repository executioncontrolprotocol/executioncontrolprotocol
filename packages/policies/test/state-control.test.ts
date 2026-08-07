import { describe, expect, it } from "vitest"
import { createUsageLedger } from "@executioncontrolprotocol/core"
import type { PolicyContext } from "@executioncontrolprotocol/core"
import type {
  PendingMutation,
  PolicyDecision,
  PolicyLifecycleEvent,
  StoreStateHandle,
} from "@executioncontrolprotocol/types"
import { stateControlPolicy } from "../src/index.js"

function handle(path: string): StoreStateHandle {
  return { path, __brand: undefined } as StoreStateHandle
}

function mutation(partial: Partial<PendingMutation> & { path: string }): PendingMutation {
  return {
    id: partial.id ?? "m1",
    op: partial.op ?? "merge",
    path: partial.path,
    value: partial.value ?? { x: 1 },
    status: "pending",
    ...(partial.reason ? { reason: partial.reason } : {}),
  }
}

async function evalPolicy(
  event: PolicyLifecycleEvent,
  config: Record<string, unknown>,
  extra: Partial<PolicyContext>
): Promise<PolicyDecision | void> {
  const hook = stateControlPolicy.hooks.find((h) => h.event === event)
  if (!hook) throw new Error(`missing ${event}`)
  const ctx: PolicyContext & { config: Record<string, unknown> } = {
    workflow: { schema: "@executioncontrolprotocol.workflow", version: "1.0.0", workflow: { id: "stub" }, steps: [] },
    run: { id: "run", input: {} },
    step: { id: "s1", capabilityId: "@executioncontrolprotocol/test.echo" },
    state: {},
    input: {},
    usage: createUsageLedger(),
    config,
    ...extra,
  }
  return (await hook.handler(ctx as never)) as PolicyDecision | void
}

describe("@executioncontrolprotocol/state-control enforcement", () => {
  it("denies a path on the denied list (denied wins over allowed)", async () => {
    const decision = await evalPolicy(
      "policy:pre",
      { allowedMutablePaths: ["draft"], deniedMutablePaths: ["draft.secret"] },
      { mutableStateHandles: [handle("draft.secret")] }
    )
    expect(decision?.type).toBe("deny")
    expect((decision as { code?: string }).code).toBe("STATE_PATH_DENIED")
  })

  it("denies a path absent from the allow list", async () => {
    const decision = await evalPolicy(
      "policy:pre",
      { allowedMutablePaths: ["allowed"] },
      { mutableStateHandles: [handle("forbidden")] }
    )
    expect(decision?.type).toBe("deny")
    expect((decision as { code?: string }).code).toBe("STATE_PATH_NOT_ALLOWED")
  })

  it("allows an allowed path and its descendants", async () => {
    const decision = await evalPolicy(
      "policy:pre",
      { allowedMutablePaths: ["draft"] },
      { mutableStateHandles: [handle("draft.body")] }
    )
    expect(decision).toEqual({ type: "allow" })
  })

  it("denies when mutation count exceeds maxMutationsPerStep", async () => {
    const decision = await evalPolicy(
      "policy:post",
      { maxMutationsPerStep: 1 },
      { pendingMutations: [mutation({ path: "a" }), mutation({ id: "m2", path: "b" })] }
    )
    expect(decision?.type).toBe("deny")
    expect((decision as { code?: string }).code).toBe("STATE_MAX_MUTATIONS")
  })

  it("denies a mutation op outside allowedMutationOps", async () => {
    const decision = await evalPolicy(
      "policy:post",
      { allowedMutationOps: ["merge"] },
      { pendingMutations: [mutation({ path: "a", op: "replace" })] }
    )
    expect(decision?.type).toBe("deny")
    expect((decision as { code?: string }).code).toBe("STATE_OP_NOT_ALLOWED")
  })

  it("denies a mutation missing a reason when requireReason is set", async () => {
    const decision = await evalPolicy(
      "policy:post",
      { requireReason: true },
      { pendingMutations: [mutation({ path: "a" })] }
    )
    expect(decision?.type).toBe("deny")
    expect((decision as { code?: string }).code).toBe("STATE_REASON_REQUIRED")
  })

  it("allows mutations that satisfy op and reason constraints", async () => {
    const decision = await evalPolicy(
      "policy:post",
      { allowedMutationOps: ["merge"], requireReason: true },
      { pendingMutations: [mutation({ path: "a", op: "merge", reason: "update draft" })] }
    )
    expect(decision).toEqual({ type: "allow" })
  })
})
