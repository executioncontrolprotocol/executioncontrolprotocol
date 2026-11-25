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
    const edge = page.locator(".react-flow__edge.ecp-rf-edge--data").first()
    await edge.click({ button: "right", force: true })
    await page.getByTestId("canvas-menu-item-delete-connector").click()
    await expect.poll(() => {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { steps: Array<{ id?: string; input?: Record<string, unknown> }> }
      const step = manifest.steps.find((node) => node.id === "fromExpr")
      return step !== undefined && !("seed" in (step.input ?? {}))
    }, { timeout: 15_000 }).toBe(true)
  })
})