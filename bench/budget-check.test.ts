import { describe, expect, it } from "vitest"
import {
  budgetFromTarget,
  collectBaselineBudgetViolations,
  collectBudgetTargetViolations,
  collectMissingBaselineOses,
  collectMissingTargets,
  requiredBaselineOses,
} from "./budget-check.mjs"

describe("budget-check", () => {
  it("flags missing targets", () => {
    expect(collectMissingTargets({ a: { medianMs: 1 } }, {})).toEqual([
      "budget key a missing from targets.json",
    ])
  })

  it("accepts budget at or under target", () => {
    const err = collectBudgetTargetViolations(
      { a: { medianMs: 900 } },
      { a: { medianMs: 1000 } },
      "plan",
    )
    expect(err).toHaveLength(0)
  })

  it("rejects over target without exception", () => {
    const err = collectBudgetTargetViolations(
      { a: { medianMs: 1100 } },
      { a: { medianMs: 1000 } },
      "plan",
    )
    expect(err[0]).toMatch(/no exception/)
  })

  it("rejects exception missing from plan", () => {
    const err = collectBudgetTargetViolations(
      { a: { medianMs: 1100, exception: "not in plan" } },
      { a: { medianMs: 1000 } },
      "other text",
    )
    expect(err[0]).toMatch(/exception not found/)
  })

  it("accepts over target with plan exception", () => {
    const sentence = "B8 overhead measured above design target on Windows."
    const err = collectBudgetTargetViolations(
      { a: { medianMs: 200, exception: sentence } },
      { a: { medianMs: 100 } },
      `foo ${sentence} bar`,
    )
    expect(err).toHaveLength(0)
  })

  it("allows null baseline median with note only", () => {
    expect(
      collectBaselineBudgetViolations(
        { b4: { medianMs: null, note: "skipped" } },
        { b4: { medianMs: null } },
      ),
    ).toHaveLength(0)
    expect(
      collectBaselineBudgetViolations({ b4: { medianMs: null } }, { b4: { medianMs: null } }),
    ).toHaveLength(1)
  })

  it("requires win32 baseline always", () => {
    expect(requiredBaselineOses(["2026-11-17-win32.json"])).toEqual(["win32"])
    expect(requiredBaselineOses(["2026-11-17-win32.json", "2026-11-17-linux.json"])).toEqual([
      "win32",
      "linux",
    ])
  })

  it("collectMissingBaselineOses lists gaps", () => {
    expect(collectMissingBaselineOses(["x-win32.json"], ["win32"])).toHaveLength(0)
    expect(collectMissingBaselineOses([], ["win32"])[0]).toMatch(/win32/)
  })

  it("budgetFromTarget uses target when under and rounds up when over", () => {
    expect(budgetFromTarget(800, 1000)).toEqual({ medianMs: 1000, needsException: false })
    expect(budgetFromTarget(172, 100)).toEqual({ medianMs: 200, needsException: true })
  })
})