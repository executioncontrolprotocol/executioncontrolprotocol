import type { ReactFlowRouteLevel } from "./types.js"

/** Separator between nested branch arm labels on one connector pill. */
const BRANCH_LABEL_JOIN = " \u203a "

/**
 * Canvas pill text for a route edge: branch arm labels only, outer first.
 * @category App
 */
export function routeEdgeLabel(levels: readonly ReactFlowRouteLevel[]): string {
  const labels: string[] = []
  for (const level of levels) {
    if (level.route === "branch" && level.label) labels.push(level.label)
  }
  return labels.join(BRANCH_LABEL_JOIN)
}

/**
 * Route stack level targeted by Delete on a connector (innermost branch arm when present).
 * @category App
 */
export function routeDeleteTarget(levels: readonly ReactFlowRouteLevel[]): number | undefined {
  let branchMax: number | undefined
  let parallelMax: number | undefined
  let sequenceIndex: number | undefined
  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index]!
    if (level.route === "branch" && level.structureId !== undefined && level.armIndex !== undefined) {
      branchMax = index
    } else if (level.route === "parallel" && level.structureId !== undefined && level.armIndex !== undefined) {
      parallelMax = index
    } else if (level.route === "sequence") {
      sequenceIndex = index
    }
  }
  if (branchMax !== undefined) return branchMax
  if (parallelMax !== undefined) return parallelMax
  return sequenceIndex
}

/**
 * Delete menu label for a route connector at `levelIndex`.
 * @category App
 */
export function routeDeleteMenuLabel(levels: readonly ReactFlowRouteLevel[], levelIndex: number): string {
  const level = levels[levelIndex]
  if (!level) return "Delete"
  if (level.route === "branch") {
    const label = level.label
    return label ? `Delete branch ${label}` : "Delete branch"
  }
  return "Delete"
}