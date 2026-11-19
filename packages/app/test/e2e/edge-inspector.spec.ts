import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")

test.describe("Edge inspector", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let exprPath: string
  const source = path.join(repoRoot, "examples/psd-generate-background/psd-generate-background.ecp.json")

  function resetFixture(): void {
    const manifest = JSON.parse(readFileSync(source, "utf8")) as Record<string, unknown>
    writeFileSync(exprPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    exprPath = path.join(harness.workDir, "psd-generate-background.ecp.json")
    resetFixture()
  })

  test.beforeEach(() => {
    resetFixture()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: exprPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("ecp-step-composite")).toBeVisible({ timeout: 20_000 })
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

  /** Data edge whose binding marker is the composite `edits.layers` `$expr`. */
  async function selectEditsLayersExpr(page: Page): Promise<void> {
    await clickEdge(page, /Edge from generate to composite/i)
    await expect(page.getByTestId("edge-panel")).toBeVisible()
    await expect(page.getByTestId("edge-expr-editor")).toBeVisible({ timeout: 10_000 })
  }

  test("edits a $expr data edge and saves to disk", async ({ page }) => {
    await open(page)
    const before = readFileSync(exprPath, "utf8")
    await selectEditsLayersExpr(page)
    await expect(page.getByTestId("edge-panel")).toBeVisible()
    await expect(page.getByTestId("edge-expr-editor")).toBeVisible()
    const editor = page.getByTestId("edge-expr-editor")
    const unique = `/* e2e-mark-${Date.now()} */`
    await editor.fill(`${unique}\n(state) => { const layers = []; return layers; }`)
    await expect(page.getByTestId("edge-save")).toBeEnabled({ timeout: 10_000 })
    await page.getByTestId("edge-save").click()
    await expect
      .poll(() => readFileSync(exprPath, "utf8").includes(unique), { timeout: 10_000 })
      .toBe(true)
    expect(before).not.toContain(unique)
  })

  test("shows syntax error and blocks save", async ({ page }) => {
    await open(page)
    await selectEditsLayersExpr(page)
    await page.getByTestId("edge-expr-editor").fill("(state) => { return ")
    await expect(page.getByTestId("edge-expr-issues")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId("edge-save")).toBeDisabled()
  })

  test("ref-only data edge has no editor", async ({ page }) => {
    await open(page)
    await clickEdge(page, /Edge from ecp:accepts to generate/i)
    await expect(page.getByTestId("edge-panel")).toBeVisible()
    await expect(page.getByTestId("edge-ref-path")).toBeVisible()
    await expect(page.getByTestId("edge-expr-editor")).toHaveCount(0)
  })

  test("payload shows no run selected without a run", async ({ page }) => {
    await open(page)
    await selectEditsLayersExpr(page)
    await expect(page.getByTestId("edge-payload-source-source")).toContainText("No run selected")
  })
})