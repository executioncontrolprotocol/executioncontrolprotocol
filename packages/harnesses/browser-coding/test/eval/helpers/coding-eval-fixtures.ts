import { createNodeEvalFixturesLoader } from "@executioncontrolprotocol/evals"
import { CODING_EVAL_CASES_DIR, CODING_EVAL_FIXTURES_ROOT } from "./fixtures-root.js"

export const codingEvalFixturesLoader = createNodeEvalFixturesLoader({
  fixturesRoot: CODING_EVAL_FIXTURES_ROOT,
  casesDir: CODING_EVAL_CASES_DIR,
})

export const loadCodingEvalCases = codingEvalFixturesLoader.loadEvalCases
export const countCodingEvalCases = codingEvalFixturesLoader.countEvalCases
