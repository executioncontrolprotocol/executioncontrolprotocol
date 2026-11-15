import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

/** Bounded string handler (echoes `text`). */
export default async function handler(
  input: { text: string },
  _ctx: HandlerContext,
): Promise<{ text: string }> {
  return { text: input.text }
}
