import { describe, it } from "vitest"
import {
  EVAL_SUITE_VALUES,
  ollamaQwenEvalReady,
  runEvalCase,
} from "@executioncontrolprotocol/evals"
import {
  BROWSER_CODING_HARNESS_CAPABILITY,
  createCodingOllamaMatrixEnvironment,
} from "./helpers/coding-matrix-environment.js"
import { codingEvalFixturesLoader, loadCodingEvalCases } from "./helpers/coding-eval-fixtures.js"
import { CODING_MATRIX_EVAL_EXTENSION_IDS } from "./helpers/coding-matrix-extensions.js"

const readiness = await ollamaQwenEvalReady()
const cases = loadCodingEvalCases({ suite: EVAL_SUITE_VALUES.WORKFLOW_CREATE })

const runOptions = {
  fixturesLoader: codingEvalFixturesLoader,
  harnessCapability: BROWSER_CODING_HARNESS_CAPABILITY,
  descriptorExtensionIds: CODING_MATRIX_EVAL_EXTENSION_IDS,
}

describe.skipIf(!readiness.ready)(
  `matrix workflow-create (${readiness.profileId} ${readiness.model})`,
  () => {
    it.each(cases)("$id: $title", async (caseRow) => {
      const env = await createCodingOllamaMatrixEnvironment()
      const ecp = await env.init()
      try {
        await runEvalCase(ecp, env, caseRow, runOptions)
      } finally {
        await ecp.terminate()
      }
    })
  }
)
