import { createNodeEvalFixturesLoader } from "@executioncontrolprotocol/evals"
import { NANO_EVAL_CASES_DIR, NANO_EVAL_FIXTURES_ROOT } from "./fixtures-root.js"

/**
 * Node eval fixture loader for Browser Nano harness-owned cases and support fixtures.
 * @category Harness
 */
export const nanoEvalFixturesLoader = createNodeEvalFixturesLoader({
  fixturesRoot: NANO_EVAL_FIXTURES_ROOT,
  casesDir: NANO_EVAL_CASES_DIR,
})

/** Load Browser Nano eval cases from `fixtures/eval-cases/*.cases.json`. @category Harness */
export const loadNanoEvalCases = nanoEvalFixturesLoader.loadEvalCases

/** Count non-skipped Browser Nano eval cases. @category Harness */
export const countNanoEvalCases = nanoEvalFixturesLoader.countEvalCases
