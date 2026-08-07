import path from "node:path"
import { fileURLToPath } from "node:url"

const evalPackageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

/** Root directory for eval package fixtures. @category Evals */
export const EVAL_FIXTURES_ROOT = path.join(evalPackageDir, "fixtures")

/** Directory for eval case JSON catalogs. @category Evals */
export const EVAL_CASES_DIR = path.join(EVAL_FIXTURES_ROOT, "cases")

/** Directory for baseline workflow manifests. @category Evals */
export const EVAL_WORKFLOWS_DIR = path.join(EVAL_FIXTURES_ROOT, "workflows")

/** Directory for run snapshot fixtures. @category Evals */
export const EVAL_RUNS_DIR = path.join(EVAL_FIXTURES_ROOT, "runs")

/**
 * Resolve a fixture-relative path under `packages/evals/fixtures/`.
 * @category Evals
 */
export function resolveEvalFixturePath(relativePath: string): string {
  return path.join(EVAL_FIXTURES_ROOT, relativePath.replace(/^\//, ""))
}
