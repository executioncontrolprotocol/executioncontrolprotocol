import { capability, definePlugin } from "@executioncontrolprotocol/plugin-sdk"
import { z } from "zod"

/**
 * Transform capability definition. Step `accepts` / `returns` and script live on the execution step.
 * @category Plugins
 */
export const transform = capability({
  contract: "step",
  code: "script",
  summary: "Run a JavaScript transform in the host sandbox.",
  description:
    "Resolves step input, evaluates the step script in QuickJS, and returns JSON matching the step returns schema. The handler is not called.",
  useCases: ["Reshape data between capability steps without a domain plugin"],
  projections: ["Take the object your step returns schema describes"],
  accepts: z.object({}).strict(),
  returns: z.object({}).strict(),
  handler: () => import("./capabilities/transform.js"),
})

/**
 * Bundled core plugin. Registers transform capabilities shipped with the host.
 * @category Plugins
 */
export default definePlugin({
  id: "@executioncontrolprotocol/core",
  summary: "Core transform and step-contract capabilities bundled with the host.",
  description:
    "Supplies step-contract capabilities so executions can declare accepts, returns and scripts on the step node.",
  capabilities: {
    transform,
  },
})