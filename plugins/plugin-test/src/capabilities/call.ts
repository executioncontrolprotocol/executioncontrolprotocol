import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

/** Nested call handler. */
export default async function handler(
  input: { capabilityId: string; input?: unknown; config?: string },
  ctx: HandlerContext,
): Promise<{ result: unknown }> {
  const result = await ctx.call(input.capabilityId, input.input ?? {}, {
    ...(input.config === undefined ? {} : { config: input.config }),
  })
  return { result }
}
