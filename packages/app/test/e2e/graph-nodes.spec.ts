import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { executionToReactFlow } from "../../src/graph/index.js"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const nestedParallelSource = path.join(repoRoot, "examples/patterns/nested-parallel.ecp.json")
const nestedForeachSource = path.join(repoRoot, "examples/patterns/nested-foreach-branch.ecp.json")

test.describe("Graph nodes (no structural edge labels)", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let nestedParallelPath: string
  let nestedForeachPath: string

  test.beforeAll(async () => {
    harness = await startAppHarness()
    nestedParallelPath = path.join(harness.workDir, "nested-parallel.ecp.json")
    nestedForeachPath = path.join(harness.workDir, "nested-foreach-branch.ecp.json")
    copyFileSync(nestedParallelSource, nestedParallelPath)
    copyFileSync(nestedForeachSource, nestedForeachPath)
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 30_000 })
  }

  test("nested parallel renders frames and no structural edge labels", async ({ page }) => {
    await open(page, nestedParallelPath)
    const doc = executionToReactFlow(JSON.parse(readFileSync(nestedParallelSource, "utf8")) as ExecutionManifest)
    expect(doc.edges.every((edge) => edge.data.kind === "data")).toBe(true)
    await expect(page.locator('[data-testid^="ecp-frame-"]').first()).toBeVisible({ timeout: 15_000 })
  })

  test("nested foreach-branch renders loop end nodes", async ({ page }) => {
    await open(page, nestedForeachPath)
    await expect(page.locator('[data-testid^="ecp-end-"]').first()).toBeVisible({ timeout: 15_000 })
  })
})