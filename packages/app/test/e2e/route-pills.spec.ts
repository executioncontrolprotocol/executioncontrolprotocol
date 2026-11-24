import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")
const nestedBranchSource = path.join(repoRoot, "fixtures/manifests/valid/nested-branch.ecp.json")

test.describe("Route pills", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let branchLoopPath: string
  let nestedBranchPath: string

  function resetFixtures(): void {
    copyFileSync(branchLoopSource, branchLoopPath)
    copyFileSync(nestedBranchSource, nestedBranchPath)
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    branchLoopPath = path.join(harness.workDir, "branch-loop.ecp.json")
    nestedBranchPath = path.join(harness.workDir, "nested-branch.ecp.json")
    resetFixtures()
  })

  test.beforeEach(() => {
    resetFixtures()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
  }

  test("branch-loop pills select their route edge and load the arm expr", async ({ page }) => {
    await open(page, branchLoopPath)
    const expandPill = page
      .locator('[data-testid^="ecp-route-label-"]')
      .filter({ hasText: "expand · state.expand === true" })
      .first()
    await expandPill.click()
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-selected-edge", /route-seq-.*-Seed-expanded/)
    await expect(expandPill).toHaveClass(/ecp-rf-edge-label--selected/)
    await expect(page.getByTestId("edge-expr-editor")).toHaveValue("(state) => state.expand === true")
    expect(await page.getByTestId("workspace").getAttribute("data-selected-edge")).not.toMatch(/data-returns/)

    const compactPill = page
      .locator('[data-testid^="ecp-route-label-"]')
      .filter({ hasText: "compact · state.expand === false" })
      .first()
    await compactPill.click()
    await expect(page.getByTestId("edge-expr-editor")).toHaveValue("(state) => state.expand === false")
    await expect(compactPill).toHaveClass(/ecp-rf-edge-label--selected/)
    await expect(expandPill).not.toHaveClass(/ecp-rf-edge-label--selected/)
  })

  test("nested-branch stacks pills and edits the inner arm only", async ({ page }) => {
    await open(page, nestedBranchPath)
    const toXStack = page
      .locator(".ecp-rf-edge-label-stack")
      .filter({ has: page.locator(".ecp-rf-edge-label", { hasText: "inner · 1 === 1" }) })
      .first()
    const toX = toXStack.locator(".ecp-rf-edge-label")
    await expect(toX).toHaveCount(2)
    await expect(toX.nth(0)).toHaveText("outer · true")
    await expect(toX.nth(1)).toHaveText("inner · 1 === 1")

    const toWStack = page
      .locator(".ecp-rf-edge-label-stack")
      .filter({ has: page.locator(".ecp-rf-edge-label", { hasText: "default" }) })
      .filter({ has: page.locator(".ecp-rf-edge-label", { hasText: "outer · true" }) })
      .first()
    await expect(toWStack.locator(".ecp-rf-edge-label")).toHaveCount(2)

    await toX.nth(1).click()
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-selected-level", "1")
    await expect(page.getByTestId("edge-expr-editor")).toHaveValue("(state) => 1 === 1")

    const before = readFileSync(nestedBranchPath, "utf8")
    await page.getByTestId("edge-expr-editor").fill("(state) => false")
    await expect(page.getByTestId("edge-save")).toBeEnabled({ timeout: 15_000 })
    await page.getByTestId("edge-save").click()
    await expect.poll(() => readFileSync(nestedBranchPath, "utf8")).not.toBe(before)

    const saved = JSON.parse(readFileSync(nestedBranchPath, "utf8")) as {
      steps: Array<{
        type?: string
        branches?: Array<{
          expr?: string
          steps?: Array<{ type?: string; branches?: Array<{ expr?: string }> }>
        }>
      }>
    }
    const outerExpr = saved.steps[1]?.branches?.[0]?.expr
    const innerBranch = saved.steps[1]?.branches?.[0]?.steps?.[0]
    const innerExpr = innerBranch?.branches?.[0]?.expr
    const innerDefault = innerBranch?.branches?.[1]
    expect(outerExpr).toBe("(state) => true")
    expect(innerExpr).toBe("(state) => false")
    expect(innerDefault?.expr).toBeUndefined()
  })
})