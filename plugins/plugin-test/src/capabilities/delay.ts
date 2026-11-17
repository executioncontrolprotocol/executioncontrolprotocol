import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import { awaitTestDelay } from "./delay-hooks.js"

/** Delay handler. */
export default async function handler(
  input: { ms: number; hold?: boolean },
  ctx: HandlerContext,
): Promise<{ waitedMs: number }> {
  await awaitTestDelay(input.ms, ctx.signal, input.hold)
  return { waitedMs: input.ms }
}
