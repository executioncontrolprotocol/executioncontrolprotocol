import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")

test.describe("Containers and menus", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let branchLoopPath: string
  let originalText: string

  function resetFixture(): void {
    copyFileSync(branchLoopSource, branchLoopPath)
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    branchLoopPath = path.join(harness.workDir, "branch-loop.ecp.json")
    originalText = readFileSync(branchLoopSource, "utf8")
    resetFixture()
  })

  test.beforeEach(() => {
    resetFixture()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    // Wait for the document version (the edit session is ready) before interacting, as the other specs do.
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 20_000 })
  }

  test("branch-loop shows frames for if and while loop", async ({ page }) => {
    await open(page, branchLoopPath)
    await expect(page.getByTestId("ecp-frame-pick")).toBeVisible()
    await expect(page.getByTestId("ecp-frame-retry")).toBeVisible()
  })

  test("right-click step opens the node menu and blocks the native menu", async ({ page }) => {
    await open(page, branchLoopPath)
  await page.evaluate(() => {
      window.__ecpContextMenuPrevented = false
      document.addEventListener(
        "contextmenu",
        (event) => {
          window.__ecpContextMenuPrevented = event.defaultPrevented
        },
        { once: true },
      )
    })
    const step = page.getByTestId("ecp-step-expanded")
    await step.click({ button: "right" })
    await expect(page.getByTestId("canvas-menu")).toBeVisible()
    expect(await page.evaluate(() => window.__ecpContextMenuPrevented)).toBe(true)
  })

  test("wrap in if saves and shows a frame", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-step-expanded").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-wrap").click()
    await page.getByTestId("canvas-menu-item-wrap-if").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toContain('"id": "if-1"')
    await expect(page.locator('[data-testid="ecp-frame-if-1"]')).toBeVisible({ timeout: 15_000 })
  })

  test("delete keep steps restores the file", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-step-expanded").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-wrap").click()
    await page.getByTestId("canvas-menu-item-wrap-if").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toContain('"id": "if-1"')
    await page.getByTestId("ecp-frame-menu-if-1").click()
    await page.getByTestId("canvas-menu-item-delete").click()
    await page.getByTestId("canvas-menu-item-delete-keep-steps").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toBe(originalText)
  })

  test("delete step removes it from disk", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-step-gated").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-delete-step").click()
    await expect
      .poll(() => !readFileSync(branchLoopPath, "utf8").includes('"id": "gated"'))
      .toBe(true)
    await expect(page.getByTestId("ecp-step-gated")).toHaveCount(0)
  })

  test("read-only replay offers Configure only", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("tab-run").click()
    await page.locator("#run-input-expand").selectOption("true")
    await page.getByTestId("ecp-run").click()
    await expect(page.getByTestId("run-status")).toHaveAttribute("data-status", "completed", { timeout: 20_000 })
    await page.getByTestId("tab-runs").click()
    await page.getByTestId("run-history-item").first().click()
    await expect(page.getByTestId("run-replay")).toBeVisible()
    await page.getByTestId("ecp-step-expanded").click({ button: "right" })
    await expect(page.getByTestId("canvas-menu-item-configure")).toBeVisible()
    await expect(page.getByTestId("canvas-menu-item-wrap")).toHaveCount(0)
    await expect(page.getByTestId("canvas-menu-item-delete-step")).toHaveCount(0)
  })
})

declare global {
  interface Window {
    __ecpContextMenuPrevented?: boolean
  }
}