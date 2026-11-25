import { copyFileSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchSource = path.join(repoRoot, "fixtures/manifests/valid/branch.ecp.json")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")

test.describe("Capability menu", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let linearPath: string
  let branchPath: string
  let branchLoopPath: string

  function resetLinear(): void {
    writeFileSync(
      linearPath,
      `${JSON.stringify(
        {
          schema: "@executioncontrolprotocol.execution",
          version: "2.0",
          steps: [
            {
              id: "seed",
              uses: "@executioncontrolprotocol/test.echo",
              input: { value: "seed" },
              as: "seed",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    )
  }

  function resetBranch(): void {
    copyFileSync(branchSource, branchPath)
  }

  function resetBranchLoop(): void {
    copyFileSync(branchLoopSource, branchLoopPath)
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    linearPath = path.join(harness.workDir, "linear-capability.ecp.json")
    branchPath = path.join(harness.workDir, "branch-capability.ecp.json")
    branchLoopPath = path.join(harness.workDir, "branch-loop-capability.ecp.json")
    resetLinear()
    resetBranch()
    resetBranchLoop()
  })

  test.beforeEach(() => {
    resetLinear()
    resetBranch()
    resetBranchLoop()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
  }

  test("pane right-click adds echo at end and selects the node", async ({ page }) => {
    await open(page, linearPath)
    await page.locator(".react-flow__pane").click({ button: "right" })
    await expect(page.getByTestId("capability-menu")).toBeVisible()
    await expect(page.getByTestId("capability-menu-search")).toBeFocused()
    await page.getByTestId("capability-menu-search").fill("echo")
    const row = page.getByTestId("capability-menu-item-@executioncontrolprotocol/test.echo")
    await expect(row).toHaveAttribute("data-active", "true", { timeout: 15_000 })
    await page.getByTestId("capability-menu-search").press("Enter")
    await expect.poll(() => {
      const text = readFileSync(linearPath, "utf8")
      return text.includes('"id": "echo"') && text.includes('"uses": "@executioncontrolprotocol/test.echo"')
    }).toBe(true)
    const parsed = JSON.parse(readFileSync(linearPath, "utf8")) as { steps: unknown[] }
    const last = parsed.steps.at(-1) as { id: string; uses: string; input?: unknown }
    expect(last).toMatchObject({ id: "echo", uses: "@executioncontrolprotocol/test.echo" })
    expect(last.input).toBeUndefined()
    await expect(page.getByTestId("ecp-step-echo")).toBeVisible()
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-selected-node", "echo")
  })

  test("keyboard moves selection and Escape closes", async ({ page }) => {
    await open(page, linearPath)
    await page.locator(".react-flow__pane").click({ button: "right" })
    await expect(page.getByTestId("capability-menu")).toBeVisible()
    await expect(page.getByTestId("capability-menu-search")).toBeFocused()
    const items = page.locator('[data-testid^="capability-menu-item-"]')
    await expect(items.first()).toBeVisible({ timeout: 15_000 })
    await expect(items).not.toHaveCount(0)
    await expect(items.first()).toHaveCount(1)
    const second = items.nth(1)
    await expect(second).toBeVisible({ timeout: 15_000 })
    const firstId = await items.first().getAttribute("data-testid")
    await expect(items.first()).toHaveAttribute("data-active", "true")
    await page.getByTestId("capability-menu-search").press("ArrowDown")
    await expect(second).toHaveAttribute("data-active", "true")
    if (firstId) await expect(page.getByTestId(firstId)).toHaveAttribute("data-active", "false")
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("capability-menu")).toHaveCount(0)
  })

  test("container Add to then inserts a step", async ({ page }) => {
    await open(page, branchPath)
    await page.getByTestId("ecp-if-pick").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-add-then").click()
    await expect(page.getByTestId("capability-menu")).toBeVisible()
    await page.getByTestId("capability-menu-search").fill("echo")
    await page.getByTestId("capability-menu-item-@executioncontrolprotocol/test.echo").click()
    const parsed = JSON.parse(readFileSync(branchPath, "utf8")) as {
      steps: Array<{ type: string; then?: Array<{ uses?: string }> }>
    }
    const ifNode = parsed.steps[0]!
    expect(ifNode.type).toBe("if")
    expect(ifNode.then?.some((step) => step.uses === "@executioncontrolprotocol/test.echo")).toBe(true)
  })


  test("loop Add step appends with mode replace and stays valid", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-loop-retry").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-add-step").click()
    await page.getByTestId("capability-menu-search").fill("echo")
    await page.getByTestId("capability-menu-item-@executioncontrolprotocol/test.echo").click()
    const parsed = JSON.parse(readFileSync(branchLoopPath, "utf8")) as {
      steps: Array<{ id: string; type?: string; steps?: Array<{ id: string; uses: string; mode?: string }> }>
    }
    const retry = parsed.steps.find((node) => node.id === "retry")
    expect(retry?.steps).toHaveLength(2)
    const added = retry?.steps?.[1]
    expect(added).toMatchObject({ uses: "@executioncontrolprotocol/test.echo", mode: "replace" })
    expect(retry?.steps?.[0]?.id).toBe("tick")
    await expect(page.getByTestId("validation-status")).toHaveAttribute("data-valid", "true", { timeout: 15_000 })
  })

  test("replay pane right-click does not open capability menu", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("tab-run").click()
    await page.locator("#run-input-expand").selectOption("true")
    await page.getByTestId("ecp-run").click()
    await expect(page.getByTestId("run-status")).toHaveAttribute("data-status", "completed", { timeout: 20_000 })
    await page.getByTestId("tab-runs").click()
    await page.getByTestId("run-history-item").first().click()
    await expect(page.getByTestId("run-replay")).toBeVisible()
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
    await page.locator(".react-flow__pane").click({ button: "right" })
    expect(await page.evaluate(() => window.__ecpContextMenuPrevented)).toBe(true)
    await expect(page.getByTestId("capability-menu")).toHaveCount(0)
  })
})

declare global {
  interface Window {
    __ecpContextMenuPrevented?: boolean
  }
}