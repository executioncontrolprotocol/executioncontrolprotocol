import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { executionToReactFlow } from "../../src/graph/index.js"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const nestedBranchSource = path.join(repoRoot, "fixtures/manifests/valid/nested-branch.ecp.json")
const nestedForeachSource = path.join(repoRoot, "examples/patterns/nested-foreach-branch.ecp.json")

test.describe("Route pills", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let nestedBranchPath: string
  let nestedForeachPath: string

  function resetFixtures(): void {
    copyFileSync(nestedBranchSource, nestedBranchPath)
    copyFileSync(nestedForeachSource, nestedForeachPath)
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    nestedBranchPath = path.join(harness.workDir, "route-pills-nested-branch.ecp.json")
    nestedForeachPath = path.join(harness.workDir, "route-pills-nested-foreach.ecp.json")
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
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 30_000 })
  }

  test("nested-foreach pills omit expressions and the panel edits the selected arm", async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, nestedForeachPath)
    const doc = executionToReactFlow(JSON.parse(readFileSync(nestedForeachSource, "utf8")) as ExecutionManifest)
    const pickEdge = doc.edges.find(
      (edge) =>
        edge.data.kind === "route" &&
        edge.target === "pick" &&
        edge.data.levels.some((level) => level.route === "branch" && level.structureId === "shipping"),
    )
    expect(pickEdge?.id).toBeDefined()
    await expect(page.getByTestId("ecp-step-pick")).toBeVisible({ timeout: 30_000 })
    const pickPill = page.getByTestId(`ecp-route-label-${pickEdge!.id}`)
    await pickPill.scrollIntoViewIfNeeded()
    await expect(pickPill).toHaveText("express", { timeout: 30_000 })
    await expect(pickPill).not.toContainText("=>")
    await pickPill.click()
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-selected-edge", pickEdge!.id, { timeout: 15_000 })
    await expect(page.locator("#edge-expr-editor-shipping-0")).toHaveValue(
      "(state) => String(state.order).startsWith('express')",
      { timeout: 20_000 },
    )

    const menu = page.getByTestId(`ecp-edge-menu-${pickEdge!.id}`)
    await pickPill.hover()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await expect(menu).not.toHaveClass(/ecp-rf-edge-menu--hidden/)
  })

  test("nested-branch shows one stacked pill and edits the inner arm only", async ({ page }) => {
    await open(page, nestedBranchPath)
    const doc = executionToReactFlow(JSON.parse(readFileSync(nestedBranchSource, "utf8")) as ExecutionManifest)
    const toX = doc.edges.find((edge) => edge.data.kind === "route" && edge.target === "x")
    expect(toX?.id).toBeDefined()
    const pill = page.getByTestId(`ecp-route-label-${toX!.id}`)
    await expect(pill).toHaveText("outer \u203a inner")

    await pill.click()
    const sections = page.getByTestId("edge-branch-section")
    await expect(sections).toHaveCount(2)
    await expect(sections.nth(0).getByTestId("edge-expr-editor")).toHaveValue("(state) => true")
    await expect(sections.nth(1).getByTestId("edge-expr-editor")).toHaveValue("(state) => 1 === 1")

    await sections.nth(1).getByTestId("edge-expr-editor").fill("(state) => false")
    await sections.nth(1).getByTestId("edge-expr-editor").blur()
    await expect.poll(() => readFileSync(nestedBranchPath, "utf8").includes("(state) => false"), { timeout: 15_000 }).toBe(
      true,
    )
    const saved = JSON.parse(readFileSync(nestedBranchPath, "utf8")) as ExecutionManifest
    const outer = saved.steps.find((node) => node.id === "outer")
    expect(outer?.type).toBe("branch")
    if (outer?.type === "branch") {
      expect(outer.branches[0]?.expr).toBe("(state) => true")
      const innerBranch = outer.branches[0]?.steps[0]
      expect(innerBranch?.type).toBe("branch")
      if (innerBranch?.type === "branch") {
        expect(innerBranch.branches[0]?.expr).toBe("(state) => false")
      }
    }
  })
})