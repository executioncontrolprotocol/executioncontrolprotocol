import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  collectBaselineBudgetViolations,
  collectBudgetTargetViolations,
  collectMissingBaselineOses,
  collectMissingTargets,
  requiredBaselineOses,
} from "../../../bench/budget-check.mjs"
import { acceptanceRepoRoot } from "./support.js"

describe("A11 benchmark decision, targets, and budgets", () => {
  it("Phase 5 decision, targets, budgets, and baselines align", () => {
    const plan = readFileSync(path.join(acceptanceRepoRoot, "REALIGNMENT-PLAN.md"), "utf8")
    expect(plan).toMatch(/Phase 5 decision/)
    expect(plan).toMatch(/auto-start with idle shutdown/i)
    expect(plan).toMatch(/bench\/budgets\.json/)

    const budgets = JSON.parse(
      readFileSync(path.join(acceptanceRepoRoot, "bench/budgets.json"), "utf8"),
    ) as {
      scenarios: Record<string, { medianMs: number | null; exception?: string; note?: string }>
    }
    const targets = JSON.parse(
      readFileSync(path.join(acceptanceRepoRoot, "bench/targets.json"), "utf8"),
    ) as {
      scenarios: Record<string, { medianMs: number | null }>
    }

    const targetErrors = collectMissingTargets(budgets.scenarios, targets.scenarios)
    expect(targetErrors, targetErrors.join("\n")).toEqual([])

    const budgetErrors = collectBudgetTargetViolations(budgets.scenarios, targets.scenarios, plan)
    expect(budgetErrors, budgetErrors.join("\n")).toEqual([])

    const baselineDir = path.join(acceptanceRepoRoot, "bench/baseline")
    const baselineFiles = readdirSync(baselineDir).filter((name) => name.endsWith(".json"))
    const required = requiredBaselineOses(baselineFiles)
    const missingOses = collectMissingBaselineOses(baselineFiles, required)
    expect(missingOses, missingOses.join("\n")).toEqual([])

    for (const file of baselineFiles) {
      if (!file.endsWith("-win32.json") && !file.endsWith("-linux.json")) continue
      const baseline = JSON.parse(readFileSync(path.join(baselineDir, file), "utf8")) as {
        scenarios: Array<{ id: string; medianMs: number | null; note?: string }>
      }
      const map = Object.fromEntries(baseline.scenarios.map((row) => [row.id, row]))
      const baselineErrors = collectBaselineBudgetViolations(map, budgets.scenarios)
      expect(baselineErrors, `${file}: ${baselineErrors.join("\n")}`).toEqual([])
    }

    const b4 = budgets.scenarios["B4-execute-firefly"]
    expect(b4).toBeUndefined()
    const skipRow = readBaselineScenario(baselineDir, baselineFiles, "B4-execute-firefly")
    expect(skipRow?.note).toMatch(/Skipped.*Firefly/i)

    expect(budgets.scenarios["B3-execute-echo-in-process"]?.medianMs).toBeGreaterThan(0)
    const b8Keys = [
      "B8-start-overhead-1k",
      "B8-start-overhead-5k",
      "B8-first-use-median",
      "B8-cached-validate",
      "B8-editor-write-warm-1k",
      "B8-execute-echo-warm-all-plugins",
    ]
    for (const key of b8Keys) {
      expect(budgets.scenarios[key]?.medianMs, key).toBeGreaterThan(0)
    }
  })
})

function readBaselineScenario(
  baselineDir: string,
  files: string[],
  id: string,
): { medianMs: number | null; note?: string } | undefined {
  for (const file of files) {
    if (!file.endsWith("-win32.json") && !file.endsWith("-linux.json")) continue
    const baseline = JSON.parse(readFileSync(path.join(baselineDir, file), "utf8")) as {
      scenarios: Array<{ id: string; medianMs: number | null; note?: string }>
    }
    const row = baseline.scenarios.find((s) => s.id === id)
    if (row) return row
  }
  return undefined
}