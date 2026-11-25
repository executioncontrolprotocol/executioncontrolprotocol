import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { executionToReactFlow } from "../../src/graph/index.js"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")
const nestedBranchSource = path.join(repoRoot, "fixtures/manifests/valid/nested-branch.ecp.json")
const markersSource = path.join(repoRoot, "fixtures/manifests/valid/markers.ecp.json")
const loopForSource = path.join(repoRoot, "fixtures/manifests/valid/loop-for.ecp.json")

test.describe("Connections and edge menus", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let branchLoopPath: string
  let nestedBranchPath: string
  let markersPath: string
  let loopForPath: string

  function reset(): void {
    copyFileSync(branchLoopSource, branchLoopPath)
    copyFileSync(nestedBranchSource, nestedBranchPath)
    copyFileSync(markersSource, markersPath)
    copyFileSync(loopForSource, loopForPath)
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    branchLoopPath = path.join(harness.workDir, "branch-loop.ecp.json")
    nestedBranchPath = path.join(harness.workDir, "nested-branch.ecp.json")
    markersPath = path.join(harness.workDir, "markers.ecp.json")
    loopForPath = path.join(harness.workDir, "loop-for.ecp.json")
    reset()
  })

  test.beforeEach(() => {
    reset()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 20_000 })
  }

  test("markers data edge delete removes binding", async ({ page }) => {
    await open(page, markersPath)
    const manifest = JSON.parse(readFileSync(markersSource, "utf8")) as ExecutionManifest
    const doc = executionToReactFlow(manifest)
    const targetEdge = doc.edges.find((edge) => edge.data.kind === "data" && edge.target === "fromExpr")
    expect(targetEdge?.id).toBeDefined()
    const rfEdge = page.locator(`.react-flow__edge[data-id="${targetEdge!.id}"]`)
    await rfEdge.click({ button: "right" })
    await expect(page.getByTestId("canvas-menu")).toBeVisible()
    await page.getByTestId("canvas-menu-item-delete-connector").click()
    await expect.poll(() => {
      const parsed = JSON.parse(readFileSync(markersPath, "utf8")) as ExecutionManifest
      const fromExpr = parsed.steps.find((step) => step.id === "fromExpr")
      return fromExpr !== undefined && !("seed" in (fromExpr.input ?? {}))
    }, { timeout: 15_000 }).toBe(true)
  })

  test("while loop maxRounds edit writes to file", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-loop-retry").click()
    const field = page.getByTestId("loop-field-max-rounds")
    await expect(field).toBeVisible()
    await field.fill("5")
    await field.press("Enter")
    await expect.poll(() => readFileSync(branchLoopPath, "utf8").includes('"maxRounds": 5')).toBe(true)
  })

  test("for loop panel omits maxRounds field", async ({ page }) => {
    await open(page, loopForPath)
    await page.getByTestId("ecp-loop-rounds").click()
    await expect(page.getByTestId("loop-field-as")).toBeVisible()
    await expect(page.getByTestId("loop-field-max-rounds")).toHaveCount(0)
  })

  test("read-only edge menu offers Configure only", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("tab-run").click()
    await page.locator("#run-input-expand").selectOption("true")
    await page.getByTestId("ecp-run").click()
    await expect(page.getByTestId("run-status")).toHaveAttribute("data-status", "completed", { timeout: 20_000 })
    await page.getByTestId("tab-runs").click()
    await page.getByTestId("run-history-item").first().click()
    await expect(page.getByTestId("run-replay")).toBeVisible()
    await page.getByTestId("tab-graph").click()
    const dataEdge = page.locator(".react-flow__edge.ecp-rf-edge--data").first()
    await dataEdge.click({ button: "right", force: true })
    await expect(page.getByTestId("canvas-menu-item-configure")).toBeVisible()
    await expect(page.getByTestId("canvas-menu-item-delete-connector")).toHaveCount(0)
  })

  test("wrap submenu opens on hover", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-step-expanded").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-wrap").hover()
    await expect(page.getByTestId("canvas-menu-item-wrap-if")).toBeVisible()
  })
})