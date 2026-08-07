/** Stub — browser evals load fixtures via load-eval-cases.browser.ts only. */
export function loadEvalCases(): never {
  throw new Error("loadEvalCases is not available in browser eval; use loadEvalCasesBrowser")
}

export function loadWorkflowFixture(): never {
  throw new Error("loadWorkflowFixture is not available in browser eval")
}

export function loadHarnessRunFixture(): never {
  throw new Error("loadHarnessRunFixture is not available in browser eval")
}

export function resolveEvalInvokeInput(): never {
  throw new Error("resolveEvalInvokeInput is not available in browser eval")
}

export function resolveSingleEvalCaseInput(): never {
  throw new Error("resolveSingleEvalCaseInput is not available in browser eval")
}

export function countOllamaEvalCases(): number {
  return 0
}

export type { LoadEvalCasesOptions } from "../../src/fixtures/load-eval-cases-options.js"
