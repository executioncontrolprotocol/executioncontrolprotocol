import type { EvalProviderProfile } from "./eval-provider.js"

/** Baked Chrome on-device Nano profile for harness matrix evals. @category Evals */
export const CHROME_NANO_EVAL = {
  id: "chrome-nano",
  providerId: "@executioncontrolprotocol/chrome-ai",
  generateCapability: "@executioncontrolprotocol/chrome-ai.generate",
  runtime: "browser",
} as const satisfies EvalProviderProfile
