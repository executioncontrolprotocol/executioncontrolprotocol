import {
  ECP_MODEL_GENERATE_INTERFACE,
  harnessEvaluateOutputSchema,
  type HarnessId,
} from "@executioncontrolprotocol/types"
import { z } from "zod"
import { defineHarness } from "../define-harness.js"
import { catalogHarness } from "../harness-catalog.js"

/** Fixture harness id for core unit tests. @category Harness */
export const TEST_MINIMAL_HARNESS_ID = "@executioncontrolprotocol/test-minimal-harness" as HarnessId

const configSchema = z.object({
  echoPrefix: z.string().default("ok"),
})

const inputSchema = z.object({
  value: z.string(),
})

/**
 * Minimal harness for framework tests (no product logic).
 * @category Harness
 */
export const testMinimalHarness = defineHarness("@executioncontrolprotocol", "test-minimal-harness")
  .withConfig(configSchema)
  .withInput(inputSchema)
  .withOutput(
    harnessEvaluateOutputSchema.extend({
      artifact: z.string(),
    })
  )
  .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
  .withHandler(async (input, ctx) => {
    const raw = input.value ?? "minimal"
    return {
      artifact: `${ctx.config.echoPrefix}:${raw}`,
      raw,
      trace: { harness: TEST_MINIMAL_HARNESS_ID, provider: ctx.uses },
    }
  })
  .build()

let registered = false

/** Register test minimal harness. @category Harness */
export function registerTestMinimalHarness(): void {
  if (registered) return
  catalogHarness(testMinimalHarness)
  registered = true
}

/** Reset test minimal harness registration (unit tests). @internal */
export function resetTestMinimalHarnessRegistrationForTests(): void {
  registered = false
}
