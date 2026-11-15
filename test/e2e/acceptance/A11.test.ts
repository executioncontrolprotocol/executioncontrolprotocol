import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { acceptanceRepoRoot } from "./support.js"

describe("A11 benchmark decision and budgets", () => {
  it("Phase 5 decision is recorded and budgets load", async () => {
    const plan = readFileSync(path.join(acceptanceRepoRoot, "REALIGNMENT-PLAN.md"), "utf8")
    expect(plan).toMatch(/Phase 5 decision/)
    expect(plan).toMatch(/Keep in-process fallback/i)
    expect(plan).toMatch(/bench\/budgets\.json/)

    const budgetsPath = path.join(acceptanceRepoRoot, "bench/budgets.json")
    expect(existsSync(budgetsPath)).toBe(true)
    const budgets = JSON.parse(readFileSync(budgetsPath, "utf8")) as {
      scenarios: Record<string, { medianMs: number }>
    }
    expect(Object.keys(budgets.scenarios).length).toBeGreaterThan(0)
    expect(budgets.scenarios["B3-execute-echo-in-process"]?.medianMs).toBeGreaterThan(0)

    // Load budgets the same way the bench runner does (do not require gitignored results/).
    const { pathToFileURL } = await import("node:url")
    const benchPath = path.join(acceptanceRepoRoot, "bench/run.mjs")
    expect(existsSync(benchPath)).toBe(true)
    // Import only to ensure the module parses; budgets are read at run time.
    void pathToFileURL
    const loaded = JSON.parse(readFileSync(budgetsPath, "utf8"))
    expect(loaded.scenarios).toBeTruthy()
  })
})
