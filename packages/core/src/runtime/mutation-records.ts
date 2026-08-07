import type { MutationRecord, PendingMutation } from "@executioncontrolprotocol/types"

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".")
  let cur: unknown = obj
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

/** Map staged mutations to committed audit records. */
export function pendingToMutationRecords(
  pending: PendingMutation[],
  stepId: string,
  capability: string,
  stateBefore: Record<string, unknown>
): MutationRecord[] {
  const timestamp = new Date().toISOString()
  return pending.map((m) => ({
    id: m.id,
    op: m.op,
    path: m.path,
    before: getAtPath(stateBefore, m.path),
    after: m.value,
    ...(m.reason ? { reason: m.reason } : {}),
    ...(m.metadata ? { metadata: m.metadata } : {}),
    status: "committed" as const,
    stepId,
    capability,
    timestamp,
  }))
}
