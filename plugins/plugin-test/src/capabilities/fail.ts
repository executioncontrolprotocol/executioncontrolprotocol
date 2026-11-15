import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

/** Fail handler. */
export default async function handler(
  input: { code?: string; message?: string },
  _ctx: HandlerContext,
): Promise<Record<string, never>> {
  throw Object.assign(new Error(input.message ?? "failed"), {
    code: input.code ?? "ECP_STEP_FAILED",
  })
}
