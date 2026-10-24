import { satisfies } from "semver"

/**
 * True when `version` is in `range` (prereleases included).
 * @category Workflow
 */
export function satisfiesRange(version: string, range: string): boolean {
  return satisfies(version, range, { includePrerelease: true })
}
