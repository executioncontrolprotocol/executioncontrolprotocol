import type { HandlerContext, StateHandle } from "@executioncontrolprotocol/plugin-sdk"

/** Stage handler. */
export default async function handler(
  input: {
    handle: { $state?: string }
    op: "set" | "merge" | "append"
    value: unknown
    fail?: boolean
  },
  ctx: HandlerContext,
): Promise<{ ok: boolean }> {
  const path = typeof input.handle.$state === "string" ? input.handle.$state : "history"
  const handle: StateHandle = { path }
  if (input.op === "set") ctx.store.set(handle, input.value)
  else if (input.op === "merge") {
    if (typeof input.value !== "object" || input.value === null || Array.isArray(input.value)) {
      throw Object.assign(new Error("merge value must be an object"), { code: "ECP_STEP_FAILED" })
    }
    ctx.store.merge(handle, input.value as Record<string, unknown>)
  } else ctx.store.append(handle, input.value)
  if (input.fail === true) {
    throw Object.assign(new Error("stage failed"), { code: "ECP_STEP_FAILED" })
  }
  return { ok: true }
}
