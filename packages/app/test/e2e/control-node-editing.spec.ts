import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { CONTROL_NODE_ENTRY_ID } from "../../src/graph/structure-edit.js"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchSource = path.join(repoRoot, "examples/patterns/branch.ecp.json")
const ifInLoopSource = path.join(repoRoot, "examples/patterns/if-in-loop.ecp.json")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")

test.describe("control node editing", () => {
  let harness: AppE2eHarness
  let branchPath: string
  let ifInLoopPath: string
  let branchLoopPath: string

  test.beforeAll(async () => {
    harness = await startAppHarness()
    branchPath = path.join(harness.workDir, "gt3-branch.ecp.json")
    ifInLoopPath = path.join(harness.workDir, "gt3-if-in-loop.ecp.json")
    branchLoopPath = path.join(harness.workDir, "gt3-branch-loop.ecp.json")
    copyFileSync(branchSource, branchPath)
    copyFileSync(ifInLoopSource, ifInLoopPath)
    copyFileSync(branchLoopSource, branchLoopPath)
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 30_000 })
  }

  test("Core menu lists control node and transform", async ({ page }) => {
    await open(page, branchPath)
    await page.locator(".react-flow__pane").click({ button: "right" })
    await expect(page.getByTestId("capability-menu")).toBeVisible()
    await expect(page.getByTestId("capability-menu-group-core")).toBeVisible()
    await expect(page.getByTestId(`capability-menu-item-${CONTROL_NODE_ENTRY_ID}`)).toBeVisible()
    await page.keyboard.press("Escape")
  })

  test("add control node from Core menu", async ({ page }) => {
    await open(page, branchPath)
    await page.locator(".react-flow__pane").click({ button: "right" })
    await expect(page.getByTestId("capability-menu")).toBeVisible()
    await page.getByTestId(`capability-menu-item-${CONTROL_NODE_ENTRY_ID}`).click()
    await expect.poll(() => readFileSync(branchPath, "utf8").includes('"type": "if"'), { timeout: 15_000 }).toBe(true)
  })

  test("switch Kind if to forEach to for to if on branch-loop", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-if-pick").click()
    await page.getByTestId("control-field-kind").selectOption("forEach")
    await expect.poll(() => readFileSync(branchLoopPath, "utf8").includes('"mode": "forEach"'), { timeout: 15_000 }).toBe(true)
    await page.getByTestId("control-field-kind").selectOption("for")
    await expect.poll(() => readFileSync(branchLoopPath, "utf8").includes('"mode": "for"'), { timeout: 15_000 }).toBe(true)
    await page.getByTestId("control-field-kind").selectOption("if")
    await expect.poll(() => readFileSync(branchLoopPath, "utf8").includes('"type": "if"'), { timeout: 15_000 }).toBe(true)
  })

  test("an if without else can become parallel", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-if-gated-gate").click()
    const kind = page.getByTestId("control-field-kind")
    await expect(kind.locator('option[value="parallel"]')).toBeEnabled()
    await kind.selectOption("parallel")
    await expect.poll(() => readFileSync(branchLoopPath, "utf8").includes('"type": "parallel"'), { timeout: 15_000 }).toBe(true)
  })

  test("delete if keeping nodes undoes", async ({ page }) => {
    await open(page, branchLoopPath)
    const before = readFileSync(branchLoopPath, "utf8")
    await page.getByTestId("ecp-if-pick").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-delete").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8"), { timeout: 30_000 }).not.toContain('"id": "pick"')
    await expect.poll(() => readFileSync(branchLoopPath, "utf8"), { timeout: 30_000 }).toContain('"id": "expanded"')
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 30_000 })
    await expect(page.getByTestId("canvas-undo")).toBeEnabled({ timeout: 15_000 })
    await page.getByTestId("canvas-undo").click()
    await expect
      .poll(() => JSON.stringify(JSON.parse(readFileSync(branchLoopPath, "utf8"))), { timeout: 30_000 })
      .toBe(JSON.stringify(JSON.parse(before)))
  })

  test("merge port shows two branches on Ship in if-in-loop", async ({ page }) => {
    await open(page, ifInLoopPath)
    await expect(page.getByTestId("ecp-step-ship")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId("ecp-step-ship").getByText(/\(2 branches\)/)).toBeVisible()
  })
})