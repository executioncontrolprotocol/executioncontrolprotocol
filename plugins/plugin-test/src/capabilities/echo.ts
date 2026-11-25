import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

/** Echo handler. */
export default async function handler(
  input: { value?: unknown },
  _ctx: HandlerContext,
): Promise<{ echo: unknown }> {
  return { echo: input.value === undefined ? null : input.value }
}
