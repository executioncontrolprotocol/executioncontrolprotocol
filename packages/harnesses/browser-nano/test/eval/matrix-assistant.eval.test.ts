import { describe, it } from "vitest"
import {
  EVAL_SUITE_VALUES,
  ollamaEvalReady,
  runEvalCase,
} from "@executioncontrolprotocol/evals"
import { createNanoOllamaMatrixEnvironment } from "./helpers/nano-matrix-environment.js"
import { loadNanoEvalCases, nanoEvalFixturesLoader } from "./helpers/nano-eval-fixtures.js"
import { NANO_MATRIX_EVAL_EXTENSION_IDS } from "./helpers/nano-matrix-extensions.js"

const readiness = await ollamaEvalReady()
const assistantCases = loadNanoEvalCases({ suite: EVAL_SUITE_VALUES.ASSISTANT })
const flowCases = loadNanoEvalCases({ suite: EVAL_SUITE_VALUES.FLOW })
const cases = [...assistantCases, ...flowCases]

const runOptions = {
  fixturesLoader: nanoEvalFixturesLoader,
  descriptorExtensionIds: NANO_MATRIX_EVAL_EXTENSION_IDS,
}

describe.skipIf(!readiness.ready)(
  `matrix assistant and flow (${readiness.profileId} ${readiness.model})`,
  () => {
    it.each(cases)("$id: $title", async (caseRow) => {
      const env = await createNanoOllamaMatrixEnvironment()
      const ecp = await env.init()
      try {
        await runEvalCase(ecp, env, caseRow, runOptions)
      } finally {
        await ecp.terminate()
      }
    })
  }
)
