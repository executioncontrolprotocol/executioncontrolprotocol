import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")
const mod = process.platform === "darwin" ? "Meta" : "Control"
/** Modifier for additive step selection (matches GraphCanvas shift/meta/ctrl). */
const additiveMod = process.platform === "darwin" ? "Meta" : "Control"

test.describe("Delete key", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let branchLoopPath: string

  function reset(): void {
    copyFileSync(branchLoopSource, branchLoopPath)
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    branchLoopPath = path.join(harness.workDir, "delete-key-branch-loop.ecp.json")
    reset()
  })

  test.beforeEach(() => {
    reset()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: branchLoopPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 20_000 })
  }

  test("Delete removes a selected step", async ({ page }) => {
    await open(page)
    await page.getByTestId("ecp-step-gated").click()
    await page.keyboard.press("Delete")
    await expect.poll(() => !readFileSync(branchLoopPath, "utf8").includes('"id": "gated"')).toBe(true)
    await expect(page.getByTestId("ecp-step-gated")).toHaveCount(0)
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-selected-steps", "")
  })

  test("Delete removes a multi-select in one save and undo restores both", async ({ page }) => {
    await open(page)
    await page.getByTestId("ecp-step-Seed").click()
    await page.getByTestId("ecp-step-tick").click({ modifiers: [additiveMod] })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-selected-steps", /Seed/)
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-selected-steps", /tick/)
    await page.keyboard.press("Delete")
    await expect.poll(() => {
      const text = readFileSync(branchLoopPath, "utf8")
      return !text.includes('"id": "Seed"') && !text.includes('"id": "tick"')
    }).toBe(true)
    await page.keyboard.press(`${mod}+KeyZ`)
    await expect.poll(() => {
      const text = readFileSync(branchLoopPath, "utf8")
      return text.includes('"id": "Seed"') && text.includes('"id": "tick"')
    }).toBe(true)
  })

  test("Delete on a branch frame unwraps the structure", async ({ page }) => {
    await open(page)
    await page.getByTestId("ecp-frame-label-pick").click()
    await page.keyboard.press("Delete")
    await expect.poll(() => !readFileSync(branchLoopPath, "utf8").includes('"id": "pick"')).toBe(true)
    await expect.poll(() => readFileSync(branchLoopPath, "utf8").includes('"id": "expanded"')).toBe(true)
    await expect.poll(() => readFileSync(branchLoopPath, "utf8").includes('"id": "compact"')).toBe(true)
  })

  test("Delete does not remove loop end nodes", async ({ page }) => {
    await open(page)
    await page.getByTestId("ecp-end-end:retry").click()
    const before = readFileSync(branchLoopPath, "utf8")
    await page.keyboard.press("Delete")
    expect(readFileSync(branchLoopPath, "utf8")).toBe(before)
    await expect(page.getByTestId("ecp-end-end:retry")).toBeVisible()
  })

  test("read-only replay ignores Delete", async ({ page }) => {
    await open(page)
    await page.getByTestId("tab-run").click()
    await page.locator("#run-input-expand").selectOption("true")
    await page.getByTestId("ecp-run").click()
    await expect(page.getByTestId("run-status")).toHaveAttribute("data-status", "completed", { timeout: 20_000 })
    await page.getByTestId("tab-runs").click()
    await page.getByTestId("run-history-item").first().click()
    await expect(page.getByTestId("run-replay")).toBeVisible()
    await page.getByTestId("tab-graph").click()
    const before = readFileSync(branchLoopPath, "utf8")
    await page.getByTestId("ecp-step-gated").click()
    await page.keyboard.press("Delete")
    expect(readFileSync(branchLoopPath, "utf8")).toBe(before)
  })

  test("undo restores a step removed with Delete", async ({ page }) => {
    await open(page)
    await page.getByTestId("ecp-step-gated").click()
    await page.keyboard.press("Delete")
    await expect.poll(() => !readFileSync(branchLoopPath, "utf8").includes('"id": "gated"')).toBe(true)
    await page.keyboard.press(`${mod}+KeyZ`)
    await expect.poll(() => readFileSync(branchLoopPath, "utf8").includes('"id": "gated"')).toBe(true)
  })
})