import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const nestedBranchSource = path.join(repoRoot, "fixtures/manifests/valid/nested-branch.ecp.json")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")

const mod = process.platform === "darwin" ? "Meta" : "Control"

test.describe("Autosave and undo", () => {
  let harness: AppE2eHarness
  let manifestPath: string

  test.beforeAll(async () => {
    harness = await startAppHarness()
    manifestPath = path.join(harness.workDir, "autosave-undo-nested.ecp.json")
    copyFileSync(nestedBranchSource, manifestPath)
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  test.beforeEach(() => {
    copyFileSync(nestedBranchSource, manifestPath)
  })

  async function open(page: Page, execPath: string = manifestPath): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: execPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
  }

  test("menu edit autosaves without Save control", async ({ page }) => {
    await open(page)
    await expect(page.getByTestId("edge-save")).toHaveCount(0)
    await page.getByRole("button", { name: "default" }).first().click()
    await page.getByTestId("edge-arm-add-condition").click()
    await expect.poll(() => readFileSync(manifestPath, "utf8").includes('"expr": "(state) => true"'), { timeout: 15_000 }).toBe(
      true,
    )
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 })
  })

  test("undo and redo restore file contents", async ({ page }) => {
    await open(page)
    const beforeText = readFileSync(manifestPath, "utf8")
    const before = JSON.parse(beforeText) as ExecutionManifest
    await page.getByRole("button", { name: "default" }).first().click()
    await page.getByTestId("edge-arm-add-condition").click()
    await expect.poll(() => readFileSync(manifestPath, "utf8") !== beforeText, { timeout: 15_000 }).toBe(true)
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 })
    await expect(page.getByTestId("canvas-undo")).toBeEnabled({ timeout: 10_000 })
    await page.getByTestId("canvas-undo").click()
    await expect
      .poll(() => JSON.stringify(JSON.parse(readFileSync(manifestPath, "utf8"))))
      .toBe(JSON.stringify(before), { timeout: 30_000 })
    await expect(page.getByTestId("canvas-redo")).toBeEnabled()
    await page.getByTestId("canvas-redo").click()
    await expect.poll(() => readFileSync(manifestPath, "utf8") !== beforeText, { timeout: 15_000 }).toBe(true)
  })

  test("expression commits after debounce", async ({ page }) => {
    await open(page)
    const pill = page.locator('[data-testid^="ecp-route-label-"]').filter({ hasText: /outer/ }).first()
    await pill.click()
    await expect(page.getByTestId("edge-expr-editor")).toBeVisible({ timeout: 10_000 })
    const unique = `(state) => state.flag === '${Date.now()}'`
    await page.getByTestId("edge-expr-editor").fill(unique)
    const immediate = readFileSync(manifestPath, "utf8")
    expect(immediate).not.toContain(unique)
    await page.getByTestId("edge-expr-editor").blur()
    await expect.poll(() => readFileSync(manifestPath, "utf8").includes(unique), { timeout: 15_000 }).toBe(true)
  })

  test("expression typing survives own autosave flush", async ({ page }) => {
    await open(page)
    const pill = page.locator('[data-testid^="ecp-route-label-"]').filter({ hasText: /outer/ }).first()
    await pill.click()
    const editor = page.getByTestId("edge-expr-editor")
    await expect(editor).toBeVisible({ timeout: 10_000 })
    const stamp = Date.now()
    const head = `(state) => state.partA === '${stamp}'`
    const tail = ` && state.partB === '${stamp + 1}'`
    await editor.fill(head)
    await page.waitForTimeout(600)
    await editor.pressSequentially(tail, { delay: 20 })
    await page.waitForTimeout(600)
    const full = `${head}${tail}`
    await expect.poll(() => readFileSync(manifestPath, "utf8").includes(full), { timeout: 20_000 }).toBe(true)
    await expect(editor).toHaveValue(full)
  })

  test("loop field typing survives own autosave flush", async ({ page }) => {
    const loopPath = path.join(harness.workDir, "autosave-undo-loop.ecp.json")
    copyFileSync(branchLoopSource, loopPath)
    await open(page, loopPath)
    await page.getByTestId("ecp-loop-retry").click()
    const field = page.getByTestId("loop-field-max-rounds")
    await expect(field).toBeVisible({ timeout: 10_000 })
    const base = 10 + (Date.now() % 50)
    const head = String(base)
    const tail = "9"
    await field.fill(head)
    await page.waitForTimeout(600)
    await field.pressSequentially(tail)
    await page.waitForTimeout(600)
    const full = `${head}${tail}`
    await expect.poll(() => readFileSync(loopPath, "utf8").includes(`"maxRounds": ${full}`), { timeout: 20_000 }).toBe(true)
    await expect(field).toHaveValue(full)
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
    await open(page, transformExec)
    await page.getByTestId("ecp-step-map").click()
    const editor = page.getByTestId("node-script-editor")
    await expect(editor).toBeVisible({ timeout: 15_000 })
    const stamp = Date.now()
    const head = `export default (v) => ({ stamp: '${stamp}'`
    const tail = `, ok: true })`
    await editor.fill(head)
    await page.waitForTimeout(600)
    await editor.pressSequentially(tail)
    await page.waitForTimeout(600)
    const full = `${head}${tail}`
    await expect.poll(() => readFileSync(scriptFile, "utf8").includes("ok: true"), { timeout: 20_000 }).toBe(true)
    await expect(editor).toHaveValue(full)
  })

  test("external file change clears undo", async ({ page }) => {
    await open(page)
    await page.getByRole("button", { name: "default" }).first().click()
    await page.getByTestId("edge-arm-add-condition").click()
    await expect(page.getByTestId("canvas-undo")).toBeEnabled({ timeout: 15_000 })
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as ExecutionManifest
    parsed.execution = { ...parsed.execution!, label: `External ${Date.now()}` }
    writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`)
    await expect(page.getByTestId("workspace-title")).toContainText("External", { timeout: 15_000 })
    await expect(page.getByTestId("canvas-undo")).toBeDisabled({ timeout: 15_000 })
  })

  test("external revert to bytes the App wrote earlier still syncs the App", async ({ page }) => {
    await open(page)
    const originalText = readFileSync(manifestPath, "utf8")
    await page.getByRole("button", { name: "default" }).first().click()
    // The App writes the edit, undoes it (writing bytes equal to an earlier save) and redoes it.
    await page.getByTestId("edge-arm-add-condition").click()
    await expect(page.getByTestId("canvas-undo")).toBeEnabled({ timeout: 15_000 })
    await page.getByTestId("canvas-undo").click()
    await expect(page.getByTestId("canvas-redo")).toBeEnabled({ timeout: 15_000 })
    const undoneText = readFileSync(manifestPath, "utf8")
    await page.getByTestId("canvas-redo").click()
    await expect.poll(() => readFileSync(manifestPath, "utf8") !== undoneText, { timeout: 15_000 }).toBe(true)
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 15_000 })
    // Someone else puts the undone bytes back. The App must show the file, not keep its redone state.
    writeFileSync(manifestPath, undoneText)
    await expect(page.getByTestId("canvas-undo")).toBeDisabled({ timeout: 15_000 })
    await expect(page.getByTestId("edge-arm-add-condition")).toBeVisible({ timeout: 15_000 })
    expect(readFileSync(manifestPath, "utf8")).toBe(undoneText)
    void originalText
  })

  test("keyboard undo and redo on canvas", async ({ page }) => {
    await open(page)
    const beforeText = readFileSync(manifestPath, "utf8")
    await page.getByRole("button", { name: "default" }).first().click()
    await page.getByTestId("edge-arm-add-condition").click()
    await expect.poll(() => readFileSync(manifestPath, "utf8") !== beforeText, { timeout: 15_000 }).toBe(true)
    await page.locator(".react-flow__pane").click()
    await page.keyboard.press(`${mod}+KeyZ`)
    const beforeJson = JSON.stringify(JSON.parse(beforeText))
    await expect
      .poll(() => JSON.stringify(JSON.parse(readFileSync(manifestPath, "utf8"))), { timeout: 30_000 })
      .toBe(beforeJson)
    await page.keyboard.press(`${mod}+KeyY`)
    await expect.poll(() => readFileSync(manifestPath, "utf8") !== beforeText, { timeout: 15_000 }).toBe(true)
  })

  test("keyboard undo ignored in expression textarea", async ({ page }) => {
    await open(page)
    const beforeText = readFileSync(manifestPath, "utf8")
    await page.getByRole("button", { name: "default" }).first().click()
    await page.getByTestId("edge-arm-add-condition").click()
    await expect.poll(() => readFileSync(manifestPath, "utf8") !== beforeText, { timeout: 15_000 }).toBe(true)
    const pill = page.locator('[data-testid^="ecp-route-label-"]').filter({ hasText: /outer/ }).first()
    await pill.click()
    const editor = page.getByTestId("edge-expr-editor")
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await page.keyboard.press(`${mod}+KeyZ`)
    await expect.poll(() => readFileSync(manifestPath, "utf8") !== beforeText, { timeout: 5_000 }).toBe(true)
  })

  test("version conflict discards queued undo", async ({ page }) => {
    await open(page)
    const before = JSON.parse(readFileSync(manifestPath, "utf8")) as ExecutionManifest
    await page.getByRole("button", { name: "default" }).first().click()
    await page.getByTestId("edge-arm-add-condition").click()
    await expect.poll(() => readFileSync(manifestPath, "utf8").includes('"expr": "(state) => true"'), { timeout: 15_000 }).toBe(
      true,
    )
    let releaseCommit: (() => void) | undefined
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve
    })
    let gateCommit = false
    await page.route("**/v1/commit", async (route) => {
      if (!gateCommit) {
        await route.continue()
        return
      }
      await commitGate
      await route.continue()
    })
    gateCommit = true
    await page.getByTestId("canvas-undo").click()
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saving", { timeout: 10_000 })
    const foreign = { ...before, execution: { ...before.execution, label: `Conflict ${Date.now()}` } }
    writeFileSync(manifestPath, `${JSON.stringify(foreign, null, 2)}\n`)
    releaseCommit!()
    await expect(page.getByTestId("version-conflict-note")).toContainText("Undo", { timeout: 30_000 })
    const onDisk = JSON.parse(readFileSync(manifestPath, "utf8")) as ExecutionManifest
    expect(onDisk.execution?.label).toContain("Conflict")
    await page.unroute("**/v1/commit")
  })

  test("undo and redo disabled during conflict replay", async ({ page }) => {
    await open(page)
    await page.getByRole("button", { name: "default" }).first().click()
    await page.getByTestId("edge-arm-add-condition").click()
    await expect.poll(() => readFileSync(manifestPath, "utf8").includes('"expr": "(state) => true"'), { timeout: 15_000 }).toBe(
      true,
    )
    let releaseCommit: (() => void) | undefined
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve
    })
    let releaseRetrieve: (() => void) | undefined
    const retrieveGate = new Promise<void>((resolve) => {
      releaseRetrieve = resolve
    })
    let gateCommit = false
    let gateRetrieve = false
    await page.route("**/v1/commit", async (route) => {
      if (!gateCommit) {
        await route.continue()
        return
      }
      await commitGate
      await route.continue()
    })
    await page.route("**/v1/retrieve*", async (route) => {
      const url = route.request().url()
      if (gateRetrieve && url.includes("execution") && !url.includes("capability")) {
        await retrieveGate
      }
      await route.continue()
    })
    gateCommit = true
    gateRetrieve = true
    await page.getByTestId("canvas-undo").click()
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saving", { timeout: 10_000 })
    const foreign = JSON.parse(readFileSync(manifestPath, "utf8")) as ExecutionManifest
    foreign.execution = { ...foreign.execution!, label: `Replay block ${Date.now()}` }
    writeFileSync(manifestPath, `${JSON.stringify(foreign, null, 2)}\n`)
    releaseCommit!()
    await expect(page.getByTestId("canvas-undo")).toBeDisabled({ timeout: 15_000 })
    await expect(page.getByTestId("canvas-redo")).toBeDisabled()
    await page.keyboard.press(`${mod}+KeyZ`)
    releaseRetrieve!()
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 30_000 })
    await page.unroute("**/v1/commit")
    await page.unroute("**/v1/retrieve*")
  })

  test("run replay disables undo and redo", async ({ page }) => {
    const loopPath = path.join(harness.workDir, "autosave-undo-run-replay.ecp.json")
    copyFileSync(branchLoopSource, loopPath)
    await open(page, loopPath)
    await page.getByTestId("tab-run").click()
    await page.locator("#run-input-expand").selectOption("true")
    await page.getByTestId("ecp-run").click()
    await expect(page.getByTestId("run-status")).toHaveAttribute("data-status", "completed", { timeout: 20_000 })
    await page.getByTestId("tab-runs").click()
    await page.getByTestId("run-history-item").first().click()
    await expect(page.getByTestId("run-replay")).toBeVisible()
    await expect(page.getByTestId("canvas-undo")).toBeDisabled()
    await expect(page.getByTestId("canvas-redo")).toBeDisabled()
  })
})