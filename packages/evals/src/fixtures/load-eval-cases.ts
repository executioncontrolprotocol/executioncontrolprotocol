import type { LoadEvalCasesOptions } from "./load-eval-cases-options.js"
import type { EvalCase, SingleEvalCase } from "./eval-case-schema.js"
import type { HarnessRunContext } from "@executioncontrolprotocol/types"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"

/** Options for loading eval cases. @category Evals */
export type { LoadEvalCasesOptions } from "./load-eval-cases-options.js"

function legacyEvalCasesRemoved(): never {
  throw new Error(
    "Eval cases moved to harness packages. Use createNodeEvalFixturesLoader from @executioncontrolprotocol/evals with harness-owned fixture paths."
  )
}

/**
 * @deprecated Eval cases live in harness packages. Use {@link createNodeEvalFixturesLoader}.
 * @category Evals
 */
export function loadEvalCases(_options?: LoadEvalCasesOptions): EvalCase[] {
  return legacyEvalCasesRemoved()
}

/** @deprecated Use a harness-owned {@link NodeEvalFixturesLoader}. @category Evals */
export const loadWorkflowFixture = (_relativePath: string): WorkflowManifest => legacyEvalCasesRemoved()

/** @deprecated Use a harness-owned {@link NodeEvalFixturesLoader}. @category Evals */
export const loadHarnessRunFixture = (_relativePath: string): HarnessRunContext => legacyEvalCasesRemoved()

/** @deprecated Use a harness-owned {@link NodeEvalFixturesLoader}. @category Evals */
export const resolveSingleEvalCaseInput = (_caseRow: SingleEvalCase): Record<string, unknown> =>
  legacyEvalCasesRemoved()

/** @deprecated Use harness package eval matrix count. @category Evals */
export function countOllamaEvalCases(): number {
  return legacyEvalCasesRemoved()
}

/** @deprecated Use resolveEvalInvokeInputFromRoot with harness fixtures root. @category Evals */
export function resolveEvalInvokeInput(_input: Record<string, unknown>): Record<string, unknown> {
  return legacyEvalCasesRemoved()
}

export {
  createNodeEvalFixturesLoader,
  loadEvalCasesFromDir,
  loadWorkflowFixtureFromRoot,
  loadHarnessRunFixtureFromRoot,
  resolveEvalInvokeInputFromRoot,
  resolveSingleEvalCaseInputFromRoot,
  resolveEvalFixturePathUnderRoot,
  type EvalFixturesPaths,
  type NodeEvalFixturesLoader,
} from "./eval-fixtures-loader.js"

export {
  createBrowserEvalFixturesLoader,
  type BrowserEvalFixtureModules,
  type BrowserEvalFixturesLoader,
} from "./eval-fixtures-loader.browser.js"

export {
  evalCaseSchema,
  EVAL_SUITE_VALUES,
  type EvalCase,
  type EvalSuite,
  type SingleEvalCase,
} from "./eval-case-schema.js"

/** Suite file name helper. @category Evals */
export { EVAL_SUITE_FILE_NAMES } from "./eval-suite-file-names.js"

/** @deprecated Harness packages own fixture paths. @category Evals */
export { resolveEvalFixturePath, EVAL_FIXTURES_ROOT, EVAL_CASES_DIR } from "./fixtures-root.js"
