import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { executionToReactFlow } from "../../src/graph/index.js"
import { appUrl, startAppHarness, type AppE2eHarness, clickBranch } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")

test.describe("Edge inspector", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let manifestPath: string
  const source = path.join(repoRoot, "fixtures/manifests/valid/markers.ecp.json")

  function resetFixture(): void {
    copyFileSync(source, manifestPath)
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    manifestPath = path.join(harness.workDir, "markers.ecp.json")
    resetFixture()
  })

  test.beforeEach(() => {
    resetFixture()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 20_000 })
  }

  test("ref data edge shows ref path and delete removes binding", async ({ page }) => {
    await open(page)
    // The branch into fromExpr's seed port (the binding this test deletes).
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ExecutionManifest
    const seedEdge = executionToReactFlow(manifest).edges.find((entry) => entry.data.kind === "data" && entry.target === "fromExpr")
    expect(seedEdge?.id).toBeDefined()
    const edge = page.locator(`.react-flow__edge[data-id="${seedEdge!.id}"]`)
    await clickBranch(page, edge, { button: "right" })
    await page.getByTestId("canvas-menu-item-delete-connector").click()
    await expect.poll(() => {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { steps: Array<{ id?: string; input?: Record<string, unknown> }> }
      const step = manifest.steps.find((node) => node.id === "fromExpr")
      return step !== undefined && !("seed" in (step.input ?? {}))
    }, { timeout: 15_000 }).toBe(true)
  })

  test("selecting a branch shows its ports and a Delete button, nothing else", async ({ page }) => {
    await open(page)
    const edge = page.locator(".react-flow__edge.ecp-rf-edge--data").first()
    await clickBranch(page, edge)
    const panel = page.getByTestId("edge-panel")
    await expect(panel).toBeVisible()
    await expect(page.getByTestId("edge-source-port")).toContainText("/")
    await expect(page.getByTestId("edge-target-port")).toContainText("/")
    await expect(page.getByTestId("edge-delete")).toBeEnabled()
    await expect(panel.locator("textarea, input, select")).toHaveCount(0)
  })

  test("the Delete button removes the reference and undo restores it", async ({ page }) => {
    await open(page)
    const before = readFileSync(manifestPath, "utf8")
    const edge = page.locator(".react-flow__edge.ecp-rf-edge--data").first()
    await clickBranch(page, edge)
    await page.getByTestId("edge-delete").click()
    await expect.poll(() => readFileSync(manifestPath, "utf8")).not.toBe(before)
    await expect(page.getByTestId("edge-panel")).toHaveCount(0)
    await page.getByTestId("canvas-undo").click()
    await expect.poll(() => JSON.stringify(JSON.parse(readFileSync(manifestPath, "utf8")))).toBe(
      JSON.stringify(JSON.parse(before)),
    )
  })
})
