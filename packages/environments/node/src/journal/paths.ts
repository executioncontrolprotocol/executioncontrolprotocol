import { join } from "node:path"

/**
 * Root directory for run journals.
 * Override with `ECP_RUNS_DIR` (hermetic tests).
 * @category Journal
 */
export function runsRoot(): string {
  return process.env.ECP_RUNS_DIR ?? join(process.cwd(), ".ecp", "runs")
}

/**
 * Directory for one run.
 * @category Journal
 */
export function runDir(runId: string, directory?: string): string {
  return join(directory ?? runsRoot(), runId)
}
