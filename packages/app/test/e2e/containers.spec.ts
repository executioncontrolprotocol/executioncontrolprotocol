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

  test("branch-loop shows tunnels for if and loop", async ({ page }) => {
    await open(page, branchLoopPath)
    await expect(page.locator('[data-testid^="ecp-tunnel-pick"]').first()).toBeVisible()
    await expect(page.locator('[data-testid^="ecp-tunnel-retry"]').first()).toBeVisible()
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
    await expect(page.locator('[data-testid^="ecp-tunnel-if-1"]').first()).toBeVisible({ timeout: 15_000 })
  })

  test("delete keep steps restores the file", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-step-expanded").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-wrap").click()
    await page.getByTestId("canvas-menu-item-wrap-if").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toContain('"id": "if-1"')
    await page.getByTestId("ecp-if-if-1").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-delete").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toBe(originalText)
  })

  test("delete with its nodes removes the if and what is inside it", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-if-pick").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-delete-with-nodes").click()
    await expect
      .poll(() => {
        const text = readFileSync(branchLoopPath, "utf8")
        return !text.includes('"id": "pick"') && !text.includes('"id": "expanded"') && !text.includes('"id": "compact"')
      })
      .toBe(true)
    await page.getByTestId("canvas-undo").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toBe(originalText)
  })

  test("wrap a step in an if, edit its expression, then undo and redo", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-step-Seed").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-wrap").click()
    await page.getByTestId("canvas-menu-item-wrap-if").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toContain('"id": "if-1"')
    await page.getByTestId("ecp-if-if-1").click()
    const condition = page.getByTestId("control-condition-text")
    await expect(condition).toBeVisible()
    await condition.fill("input.go === 1")
    await condition.blur()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toContain('"expression": "input.go === 1"')
    await page.getByTestId("canvas-undo").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).not.toContain("input.go === 1")
    await page.getByTestId("canvas-redo").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toContain('"expression": "input.go === 1"')
  })

  test("the condition switches between expression and script", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-if-pick").click()
    await page.getByTestId("control-condition-form-script").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toContain('"source": "return input.expand === true"')
    const pickNode = () =>
      (JSON.parse(readFileSync(branchLoopPath, "utf8")) as { steps: Array<{ id?: string; expression?: string }> }).steps.find(
        (node) => node.id === "pick",
      )
    expect(pickNode()?.expression).toBeUndefined()
    await page.getByTestId("control-condition-form-expression").click()
    await expect.poll(() => pickNode()?.expression).toBe("input.expand === true")
  })

  test("add node in else from the start node menu creates the else side", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-if-gated-gate").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-add-else").click()
    await page.getByTestId("capability-menu-search").fill("echo")
    await page.getByTestId("capability-menu-item-@executioncontrolprotocol/test.echo").click()
    await expect
      .poll(() => {
        const parsed = JSON.parse(readFileSync(branchLoopPath, "utf8")) as {
          steps: Array<{ id?: string; else?: Array<{ uses?: string }> }>
        }
        return parsed.steps.find((node) => node.id === "gated-gate")?.else?.[0]?.uses
      })
      .toBe("@executioncontrolprotocol/test.echo")
    await page.getByTestId("canvas-undo").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toBe(originalText)
    await page.getByTestId("canvas-redo").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).not.toBe(originalText)
  })

  test("changing the loop mode rewrites the fields and the file validates", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-loop-retry").click()
    await page.getByTestId("control-field-kind").selectOption("for")
    await expect
      .poll(() => {
        const parsed = JSON.parse(readFileSync(branchLoopPath, "utf8")) as {
          steps: Array<{ id?: string; mode?: string; input?: { count?: number } }>
        }
        const retry = parsed.steps.find((node) => node.id === "retry")
        return retry?.mode === "for" && retry.input?.count === 1
      })
      .toBe(true)
    await expect(page.getByTestId("validation-status")).toHaveAttribute("data-valid", "true", { timeout: 15_000 })
    await page.getByTestId("canvas-undo").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toBe(originalText)
    await page.getByTestId("canvas-redo").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toContain('"mode": "for"')
  })

  test("a tunnel is not selectable and ignores pointer events", async ({ page }) => {
    await open(page, branchLoopPath)
    const tunnel = page.getByTestId("ecp-tunnel-pick-then")
    await expect(tunnel).toBeVisible()
    const passThrough = await tunnel.evaluate((el) => {
      const parent = el.closest(".react-flow__node") as HTMLElement | null
      return parent?.style.pointerEvents === "none" || getComputedStyle(el).pointerEvents === "none"
    })
    expect(passThrough).toBe(true)
    await expect(tunnel).toHaveAttribute("data-kind", "then")
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
