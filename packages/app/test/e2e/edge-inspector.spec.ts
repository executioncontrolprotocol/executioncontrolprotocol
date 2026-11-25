import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")

test.describe("Edge inspector", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let manifestPath: string
  const source = path.join(repoRoot, "fixtures/manifests/valid/localize-banner.ecp.json")

  function resetFixture(): void {
    copyFileSync(source, manifestPath)
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    manifestPath = path.join(harness.workDir, "localize-banner.ecp.json")
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
    await expect(page.getByTestId("ecp-step-translate")).toBeVisible({ timeout: 20_000 })
  }

  /**
   * Select an edge by its accessible name. Dispatch the click on the edge element itself: a
   * coordinate click (even forced) lands on whichever edge is topmost at that point, and edges fanning
   * out of the Inputs node overlap differently per platform's font metrics (it hit a neighbour on Linux).
   */
  async function clickEdge(page: Page, name: RegExp): Promise<void> {
    const edge = page.getByRole("group", { name }).first()
    await expect(edge).toBeAttached()
    await edge.dispatchEvent("click")
  }

  /** Route data edge into the translate step expr gate. */
  async function selectTranslateGateExpr(page: Page): Promise<void> {
    await clickEdge(page, /Edge from ecp:accepts to translate/i)
    await expect(page.getByTestId("edge-panel")).toBeVisible()
    await expect(page.getByTestId("edge-expr-editor")).toBeVisible({ timeout: 10_000 })
  }

  test("edits a step expr gate and saves to disk", async ({ page }) => {
    await open(page)
    const before = readFileSync(manifestPath, "utf8")
    await selectTranslateGateExpr(page)
    const editor = page.getByTestId("edge-expr-editor")
    const unique = `(state) => state.locale === '${Date.now()}'`
    await editor.fill(unique)
    await expect(page.getByTestId("edge-save")).toBeEnabled({ timeout: 10_000 })
    await page.getByTestId("edge-save").click()
    await expect.poll(() => readFileSync(manifestPath, "utf8").includes(unique), { timeout: 10_000 }).toBe(true)
    expect(before).not.toContain(unique)
  })

  test("shows syntax error and blocks save", async ({ page }) => {
    await open(page)
    await selectTranslateGateExpr(page)
    await page.getByTestId("edge-expr-editor").fill("(state) => { return ")
    await expect(page.getByTestId("edge-expr-issues")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId("edge-save")).toBeDisabled()
  })

  test("ref-only data edge has no editor", async ({ page }) => {
    await open(page)
    await clickEdge(page, /Edge from prompt to translate/i)
    await expect(page.getByTestId("edge-panel")).toBeVisible()
    await expect(page.getByTestId("edge-ref-path")).toBeVisible()
    await expect(page.getByTestId("edge-expr-editor")).toHaveCount(0)
  })

  test("payload shows no run selected without a run", async ({ page }) => {
    await open(page)
    await selectTranslateGateExpr(page)
    await expect(page.getByTestId("edge-payload-source-source")).toContainText("No run selected")
  })
})