import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

/** Config-echo handler. */
export default async function handler(
  _input: Record<string, never>,
  ctx: HandlerContext<{ secret?: string; label?: string } | undefined>,
): Promise<{ keys: string[]; secretLength: number }> {
  const config = (ctx.config ?? {}) as Record<string, unknown>
  const secret = typeof config.secret === "string" ? config.secret : ""
  return {
    keys: Object.keys(config),
    secretLength: secret.length,
  }
}
