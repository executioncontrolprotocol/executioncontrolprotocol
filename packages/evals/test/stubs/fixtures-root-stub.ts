export const EVAL_FIXTURES_ROOT = "/fixtures"
export const EVAL_CASES_DIR = "/fixtures/cases"

export function resolveEvalFixturePath(relativePath: string): string {
  return `${EVAL_FIXTURES_ROOT}/${relativePath}`
}
