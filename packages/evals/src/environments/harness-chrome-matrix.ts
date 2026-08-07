import { createHarnessMatrixEnvironment } from "./create-harness-matrix-environment.js"
import { CHROME_NANO_EVAL } from "../profiles/chrome-nano.js"

/**
 * Full matrix harness eval environment (Chrome Nano + shared matrix extensions).
 * @category Evals
 */
export async function createHarnessChromeMatrixEnvironment() {
  return createHarnessMatrixEnvironment(CHROME_NANO_EVAL)
}
