import { capability, definePlugin } from "@executioncontrolprotocol/plugin-sdk"
import { z } from "zod"

/**
 * JSONata transform capability. Step `accepts`, `returns`, and `expression` live on the execution step.
 * @category Plugins
 */
export const transform = capability({
  contract: "step",
  code: "expression",
  timeoutMs: 1000,
  summary: "Evaluate a JSONata expression against resolved step input.",
  description:
    "Compiles the step expression with JSONata, evaluates it on the resolved input object, and returns JSON for the host returns check.",
  useCases: ["Project or filter fields with JSONata instead of a sandbox script"],
  projections: ["Take the JSON value JSONata returns; match it to the step returns schema"],
  accepts: z.unknown(),
  returns: z.unknown(),
  handler: () => import("./capabilities/transform.js"),
})

/**
 * JSONata transform plugin.
 * @category Plugins
 */
export default definePlugin({
  id: "@executioncontrolprotocol/jsonata",
  summary: "JSONata transforms for execution steps.",
  description:
    "Registers the optional transform capability for step-level JSONata expressions. Install separately from the host.",
  capabilities: {
    transform,
  },
})