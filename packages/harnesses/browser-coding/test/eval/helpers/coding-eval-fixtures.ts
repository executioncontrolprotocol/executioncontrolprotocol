import { createNodeEvalFixturesLoader, type EvalCase } from "@executioncontrolprotocol/evals"
import type { LoadEvalCasesOptions } from "@executioncontrolprotocol/evals"
import { CODING_EVAL_CASES_DIR, CODING_EVAL_FIXTURES_ROOT } from "./fixtures-root.js"

/** Canonical Ollama generate capability embedded in coding eval case fixtures. */
export const CODING_EVAL_FIXTURE_GENERATE_CAPABILITY =
  "@executioncontrolprotocol/ollama.generate" as const

export const codingEvalFixturesLoader = createNodeEvalFixturesLoader({
  fixturesRoot: CODING_EVAL_FIXTURES_ROOT,
  casesDir: CODING_EVAL_CASES_DIR,
})

export const loadCodingEvalCases = codingEvalFixturesLoader.loadEvalCases
export const countCodingEvalCases = codingEvalFixturesLoader.countEvalCases

/**
 * Replace Ollama generate capability strings in case JSON with the active provider's
 * generate capability (full id and bare `ollama.generate` short form).
 * @category Evals
 */
export function substituteCodingEvalGenerateCapability(
  cases: EvalCase[],
  generateCapability: string
): EvalCase[] {
  if (generateCapability === CODING_EVAL_FIXTURE_GENERATE_CAPABILITY) {
    return cases
  }
  const shortFrom = "ollama.generate"
  const shortTo = generateCapability.includes(".")
    ? generateCapability.slice(generateCapability.lastIndexOf("/") + 1)
    : generateCapability
  const rewritten = JSON.stringify(cases)
    .split(CODING_EVAL_FIXTURE_GENERATE_CAPABILITY)
    .join(generateCapability)
    .split(shortFrom)
    .join(shortTo)
  return JSON.parse(rewritten) as EvalCase[]
}

/** Load coding eval cases with generate capability substituted for a provider. @category Evals */
export function loadCodingEvalCasesForGenerateCapability(
  generateCapability: string,
  options?: LoadEvalCasesOptions
): EvalCase[] {
  return substituteCodingEvalGenerateCapability(loadCodingEvalCases(options), generateCapability)
}
