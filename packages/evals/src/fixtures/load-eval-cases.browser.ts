import { createBrowserEvalFixturesLoader } from "./eval-fixtures-loader.browser.js"
import type { EvalCase, EvalSuite, SingleEvalCase } from "./eval-case-schema.js"
import type { LoadEvalCasesOptions } from "./load-eval-cases-options.js"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"

const emptyBrowserLoader = createBrowserEvalFixturesLoader({
  caseModules: {},
  workflowModules: {},
  runModules: {},
})

/**
 * @deprecated Use createBrowserEvalFixturesLoader with harness-owned bundled fixtures.
 * @category Evals
 */
export function loadEvalCasesBrowser(options: LoadEvalCasesOptions = {}): EvalCase[] {
  return emptyBrowserLoader.loadEvalCases(options)
}

/** @deprecated Use harness-owned browser eval fixtures loader. @category Evals */
export function loadWorkflowFixtureBrowser(_relativePath: string): WorkflowManifest {
  throw new Error("Use createBrowserEvalFixturesLoader with harness-owned fixture modules")
}

/** @deprecated Use harness-owned browser eval fixtures loader. @category Evals */
export function resolveSingleEvalCaseInputBrowser(
  _caseRow: SingleEvalCase
): Record<string, unknown> {
  throw new Error("Use createBrowserEvalFixturesLoader with harness-owned fixture modules")
}

/** @deprecated Use harness-owned browser eval fixtures loader. @category Evals */
export function countBrowserEvalCases(): number {
  return emptyBrowserLoader.countEvalCases()
}

export { createBrowserEvalFixturesLoader, type BrowserEvalFixtureModules } from "./eval-fixtures-loader.browser.js"

export type { EvalSuite }
