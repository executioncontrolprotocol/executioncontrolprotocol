/**
 * Budget / target / baseline predicates for A11 (no subprocess, in-memory only).
 */

/**
 * @typedef {{ medianMs: number | null, exception?: string, note?: string }} BudgetRow
 * @typedef {{ medianMs: number | null, note?: string }} BaselineScenario
 */

/**
 * Every budgets.json key must exist in targets.json with the same target median.
 * @param {Record<string, BudgetRow>} budgetScenarios
 * @param {Record<string, { medianMs: number | null }>} targetScenarios
 * @returns {string[]}
 */
export function collectMissingTargets(budgetScenarios, targetScenarios) {
  const errors = []
  for (const id of Object.keys(budgetScenarios)) {
    if (!(id in targetScenarios)) {
      errors.push(`budget key ${id} missing from targets.json`)
    }
  }
  return errors
}

/**
 * Budget median must be <= target, or `exception` must be a non-empty string found in planText.
 * @param {Record<string, BudgetRow>} budgetScenarios
 * @param {Record<string, { medianMs: number | null }>} targetScenarios
 * @param {string} planText
 * @returns {string[]}
 */
export function collectBudgetTargetViolations(budgetScenarios, targetScenarios, planText) {
  const errors = []
  for (const [id, budget] of Object.entries(budgetScenarios)) {
    const target = targetScenarios[id]
    if (!target) continue
    if (target.medianMs == null) continue
    if (budget.medianMs == null) continue
    if (budget.medianMs <= target.medianMs) continue
    const exception = budget.exception?.trim()
    if (!exception) {
      errors.push(`${id}: medianMs ${budget.medianMs} > target ${target.medianMs} with no exception`)
      continue
    }
    if (!planText.includes(exception)) {
      errors.push(`${id}: exception not found in REALIGNMENT-PLAN.md`)
    }
  }
  return errors
}

/**
 * Baseline medians must be <= committed budget medians (null median allowed only with note).
 * @param {Record<string, BaselineScenario>} baselineScenarios
 * @param {Record<string, BudgetRow>} budgetScenarios
 * @returns {string[]}
 */
export function collectBaselineBudgetViolations(baselineScenarios, budgetScenarios) {
  const errors = []
  for (const [id, row] of Object.entries(baselineScenarios)) {
    const budget = budgetScenarios[id]
    if (!budget) continue
    if (row.medianMs == null) {
      if (!row.note) {
        errors.push(`${id}: null median without note`)
      }
      continue
    }
    if (budget.medianMs == null) continue
    if (row.medianMs > budget.medianMs) {
      errors.push(`${id}: baseline median ${row.medianMs} > budget ${budget.medianMs}`)
    }
  }
  return errors
}

/**
 * OS keys required in bench/baseline (linux only when a *-linux.json exists).
 * @param {string[]} baselineFilenames
 * @returns {string[]}
 */
export function requiredBaselineOses(baselineFilenames) {
  const required = ["win32"]
  if (baselineFilenames.some((name) => name.endsWith("-linux.json"))) {
    required.push("linux")
  }
  return required
}

/**
 * @param {string[]} baselineFilenames
 * @param {string[]} required
 * @returns {string[]}
 */
export function collectMissingBaselineOses(baselineFilenames, required) {
  const errors = []
  for (const os of required) {
    const suffix = os === "win32" ? "-win32.json" : "-linux.json"
    if (!baselineFilenames.some((name) => name.endsWith(suffix))) {
      errors.push(`missing baseline file for ${os} (*${suffix})`)
    }
  }
  return errors
}

/**
 * Round measured median up to the next 50 ms budget when over target (F6 rule).
 * @param {number} measuredMedian
 * @param {number} targetMedian
 * @returns {{ medianMs: number, needsException: boolean }}
 */
export function budgetFromTarget(measuredMedian, targetMedian) {
  if (measuredMedian <= targetMedian) {
    return { medianMs: targetMedian, needsException: false }
  }
  const rounded = Math.ceil(measuredMedian / 50) * 50
  return { medianMs: rounded, needsException: true }
}