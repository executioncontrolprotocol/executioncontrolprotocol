import { copyFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const shotsDir = "/home/ubuntu/work/ecp-canvas/shots"
const ifInLoopSource = path.join(repoRoot, "examples/patterns/if-in-loop.ecp.json")
const nestedParallelSource = path.join(repoRoot, "examples/patterns/nested-parallel.ecp.json")

test.describe("Rail phase 2 screenshots", () => {
  test.use({ deviceScaleFactor: 2 })

  let harness: AppE2eHarness

  test.beforeAll(async () => {
    harness = await startAppHarness()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, source: string, name: string): Promise<void> {
    const manifestPath = path.join(harness.workDir, name)
    copyFileSync(source, manifestPath)
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
  }

  test("marker drag in progress", async ({ page }) => {
    await open(page, ifInLoopSource, "rail2-if-in-loop.ecp.json")
    const end = page.getByTestId("ecp-end-end:express:else")
    const ship = page.getByTestId("ecp-step-ship")
    await expect(end).toBeVisible({ timeout: 15_000 })
    const endBox = await end.boundingBox()
    const shipBox = await ship.boundingBox()
    expect(endBox && shipBox).toBeTruthy()
    await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(shipBox!.x + shipBox!.width / 2, endBox!.y + endBox!.height / 2, { steps: 8 })
    await page.screenshot({ path: path.join(shotsDir, "rail2-marker-drag.png") })
    await page.mouse.up()
  })

  test("nested-parallel side labels", async ({ page }) => {
    await open(page, nestedParallelSource, "rail2-nested-parallel.ecp.json")
    await expect(page.getByTestId("ecp-rail-layer")).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: path.join(shotsDir, "rail2-nested-parallel-labels.png") })
  })
})