import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

/**
 * Placeholder handler for {@link transform}. Transform steps run in the executor sandbox, not here.
 */
export default async function handler(_input: unknown, _ctx: HandlerContext): Promise<never> {
  throw Object.assign(new Error("Transform steps are executed by the host executor, not the plugin handler."), {
    code: "ECP_STEP_FAILED",
  })
}