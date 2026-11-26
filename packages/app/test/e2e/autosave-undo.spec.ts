import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")

const mod = process.platform === "darwin" ? "Meta" : "Control"

test.describe("Autosave and undo", () => {
  let harness: AppE2eHarness
  let loopPath: string

  test.beforeAll(async () => {
    harness = await startAppHarness()
    loopPath = path.join(harness.workDir, "autosave-undo-loop.ecp.json")
    copyFileSync(branchLoopSource, loopPath)
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  test.beforeEach(() => {
    copyFileSync(branchLoopSource, loopPath)
  })

  async function open(page: Page): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: loopPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
  }

  async function bumpForLoopCount(page: Page): Promise<number> {
    await page.getByTestId("ecp-loop-retry").click()
    const field = page.getByTestId("control-loop-driver-count-value")
    await expect(field).toBeVisible({ timeout: 10_000 })
    const next = (Date.now() % 5) + 2
    await field.fill(String(next))
    await field.blur()
    await expect.poll(() => readFileSync(loopPath, "utf8").includes(`"count": ${next}`), { timeout: 15_000 }).toBe(true)
    return next
  }

  test("loop field edit autosaves without Save control", async ({ page }) => {
    await open(page)
    await expect(page.getByTestId("edge-save")).toHaveCount(0)
    await bumpForLoopCount(page)
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 })
  })

  test("undo and redo restore file contents", async ({ page }) => {
    await open(page)
    const beforeText = readFileSync(loopPath, "utf8")
    await bumpForLoopCount(page)
    await expect(page.getByTestId("canvas-undo")).toBeEnabled({ timeout: 10_000 })
    await page.getByTestId("canvas-undo").click()
    await expect
      .poll(() => JSON.stringify(JSON.parse(readFileSync(loopPath, "utf8"))))
      .toBe(JSON.stringify(JSON.parse(beforeText)), { timeout: 30_000 })
    await page.getByTestId("canvas-redo").click()
    await expect.poll(() => readFileSync(loopPath, "utf8") !== beforeText, { timeout: 15_000 }).toBe(true)
  })

  test("an if condition edit autosaves and undo and redo restore it", async ({ page }) => {
    await open(page)
    const beforeText = readFileSync(loopPath, "utf8")
    await page.getByTestId("ecp-if-pick").click()
    const condition = page.getByTestId("control-condition-text")
    await expect(condition).toBeVisible({ timeout: 10_000 })
    await condition.fill("input.expand === false")
    await condition.blur()
    await expect.poll(() => readFileSync(loopPath, "utf8").includes("input.expand === false"), { timeout: 15_000 }).toBe(true)
    await page.getByTestId("canvas-undo").click()
    await expect
      .poll(() => JSON.stringify(JSON.parse(readFileSync(loopPath, "utf8"))))
      .toBe(JSON.stringify(JSON.parse(beforeText)))
    await page.getByTestId("canvas-redo").click()
    await expect.poll(() => readFileSync(loopPath, "utf8").includes("input.expand === false")).toBe(true)
  })

  test("keyboard undo and redo on canvas", async ({ page }) => {
    await open(page)
    const beforeText = readFileSync(loopPath, "utf8")
    await bumpForLoopCount(page)
    await page.locator(".react-flow__pane").click()
    await page.keyboard.press(`${mod}+KeyZ`)
    await expect
      .poll(() => JSON.stringify(JSON.parse(readFileSync(loopPath, "utf8"))))
      .toBe(JSON.stringify(JSON.parse(beforeText)), { timeout: 30_000 })
    await page.keyboard.press(`${mod}+KeyY`)
    await expect.poll(() => readFileSync(loopPath, "utf8") !== beforeText, { timeout: 15_000 }).toBe(true)
  })

  test("path script typing survives own autosave flush", async ({ page }) => {
    const transformDir = mkdtempSync(path.join(os.tmpdir(), "ecp-autosave-script-"))
    mkdirSync(transformDir, { recursive: true })
    const scriptFile = path.join(transformDir, "step.js")
    writeFileSync(scriptFile, "export default (v) => v\n")
    const transformExec = path.join(transformDir, "transform.ecp.json")
    writeFileSync(
      transformExec,
      `${JSON.stringify(
        {
          schema: "@executioncontrolprotocol.execution",
          version: "2.0",
          execution: { label: "Transform script" },
          steps: [
            {
              id: "map",
              uses: "@executioncontrolprotocol/core.transform",
              script: { path: "step.js", lang: "js" },
              input: { value: { $ref: "state.message" } },
              as: "map",
            },
          ],
        },
        null,
        2,
      )}\n`,
    )
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: transformExec, dir: transformDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await page.getByTestId("ecp-step-map").click()
    const editor = page.getByTestId("node-script-editor")
    await expect(editor).toBeVisible({ timeout: 15_000 })
    const tail = `, ok: true })`
    await editor.fill(`export default (v) => ({ stamp: '${Date.now()}'`)
    await page.waitForTimeout(600)
    await editor.pressSequentially(tail)
    await expect.poll(() => readFileSync(scriptFile, "utf8").includes("ok: true"), { timeout: 20_000 }).toBe(true)
  })
})
