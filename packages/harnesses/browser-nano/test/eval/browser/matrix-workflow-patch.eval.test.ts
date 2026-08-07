import { describe, it } from "vitest"
import {
  CHROME_NANO_EVAL,
  EVAL_SUITE_VALUES,
  chromeNanoEvalReady,
  runEvalCase,
} from "@executioncontrolprotocol/evals"
import { createNanoBrowserMatrixEnvironment } from "../helpers/nano-browser-matrix-environment.js"
import {
  loadNanoEvalCasesBrowser,
  nanoBrowserEvalFixturesLoader,
} from "../helpers/nano-eval-fixtures.browser.js"
import { NANO_MATRIX_EVAL_EXTENSION_IDS } from "../helpers/nano-matrix-extensions.js"

const readiness = await chromeNanoEvalReady()
const cases = loadNanoEvalCasesBrowser({ suite: EVAL_SUITE_VALUES.WORKFLOW_PATCH })

const runOptions = {
  fixturesLoader: nanoBrowserEvalFixturesLoader,
  descriptorExtensionIds: NANO_MATRIX_EVAL_EXTENSION_IDS,
}

describe.skipIf(!readiness.ready)(
  `matrix workflow-patch chrome (${readiness.profileId})`,
  () => {
    it.each(cases)("$id: $title", async (caseRow) => {
      const env = await createNanoBrowserMatrixEnvironment(CHROME_NANO_EVAL)
      const ecp = await env.init()
      try {
        await runEvalCase(ecp, env, caseRow, runOptions)
      } finally {
        await ecp.terminate()
      }
    })
  }
)
