/**
 * Report from {@link buildPlugin}.
 * @category CLI
 */
export interface BuildReport {
  /** Plugin directory. */
  dir: string
  /** Written files (relative to dir). */
  written: string[]
  /** Extension or policy id loaded from dist. */
  definitionId: string
  /** Generated command ids. */
  commandIds: string[]
}

/**
 * Stale-file issue from {@link checkPlugin}.
 * @category CLI
 */
export interface CheckIssue {
  /** File or field that is stale. */
  path: string
  /** What is wrong. */
  message: string
}

/**
 * Report from {@link checkPlugin}.
 * @category CLI
 */
export interface CheckReport {
  /** Plugin directory. */
  dir: string
  /** True when generated files match the definition. */
  ok: boolean
  /** Stale or missing generated artifacts. */
  issues: CheckIssue[]
}
