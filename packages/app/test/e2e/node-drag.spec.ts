import { copyFileSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")

test.describe("Node drag", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let dragPath: string
  let linearPath: string

  test.beforeAll(async () => {
    harness = await startAppHarness()
    dragPath = path.join(harness.workDir, "node-drag.ecp.json")
    linearPath = path.join(harness.workDir, "node-drag-linear.ecp.json")
    copyFileSync(branchLoopSource, dragPath)
    resetLinear()
  })

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

  test.beforeEach(() => {
    copyFileSync(branchLoopSource, dragPath)
    resetLinear()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
  }

  async function flowTranslate(page: Page, nodeId: string): Promise<{ x: number; y: number } | null> {
    return page.evaluate((id) => {
      const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null
      if (!el) return null
      const match = /translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)/.exec(el.style.transform)
      if (!match) return null
      return { x: Number.parseFloat(match[1]!), y: Number.parseFloat(match[2]!) }
    }, nodeId)
  }

  async function dragStepBy(page: Page, stepTestId: string, dx: number): Promise<void> {
    const step = page.getByTestId(stepTestId)
    await expect(step).toBeVisible()
    const box = await step.boundingBox()
    expect(box).not.toBeNull()
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + dx, startY, { steps: 25 })
    await page.mouse.up()
  }

  test("drag, reload, auto layout, replay, cursor insert, and click select", async ({ page }) => {
    await open(page, dragPath)
    const bytesBefore = readFileSync(dragPath)

    await expect.poll(() => flowTranslate(page, "tick")).not.toBeNull()
    const before = await flowTranslate(page, "tick")
    expect(before).not.toBeNull()

    const frameBefore = await page.getByTestId("ecp-frame-retry").boundingBox()
    await dragStepBy(page, "ecp-step-tick", 200)
    const after = await flowTranslate(page, "tick")
    expect(after).not.toBeNull()
    expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(150)
    const frameAfter = await page.getByTestId("ecp-frame-retry").boundingBox()
    expect(frameAfter).not.toBeNull()
    expect(frameBefore).not.toBeNull()
    expect(frameAfter!.width).toBeGreaterThan(frameBefore!.width - 1)
    const stepBox = await page.getByTestId("ecp-step-tick").boundingBox()
    expect(stepBox!.x).toBeGreaterThanOrEqual(frameAfter!.x - 2)
    expect(stepBox!.x + stepBox!.width).toBeLessThanOrEqual(frameAfter!.x + frameAfter!.width + 2)

    await page.reload()
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    // The workspace renders before React Flow has laid out its nodes; wait for the node itself.
    await expect.poll(() => flowTranslate(page, "tick")).not.toBeNull()
    const reloaded = await flowTranslate(page, "tick")
    expect(Math.abs(reloaded!.x - after!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(reloaded!.y - after!.y)).toBeLessThanOrEqual(1)

    await page.getByTestId("canvas-auto-layout").click()
    const laidOut = await flowTranslate(page, "tick")
    expect(laidOut).not.toBeNull()
    expect(Math.abs(laidOut!.x - before!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(laidOut!.y - before!.y)).toBeLessThanOrEqual(1)

    expect(readFileSync(dragPath)).toEqual(bytesBefore)

    await page.getByTestId("tab-run").click()
    await page.locator("#run-input-expand").selectOption("true")
    await page.getByTestId("ecp-run").click()
    await expect(page.getByTestId("run-status")).toHaveAttribute("data-status", "completed", { timeout: 20_000 })
    await page.getByTestId("tab-runs").click()
    await page.getByTestId("run-history-item").first().click()
    await expect(page.getByTestId("run-replay")).toBeVisible()

    const replayBefore = await flowTranslate(page, "tick")
    await dragStepBy(page, "ecp-step-tick", 120)
    const replayAfter = await flowTranslate(page, "tick")
    expect(Math.abs(replayAfter!.x - replayBefore!.x)).toBeGreaterThan(80)
    expect(readFileSync(dragPath)).toEqual(bytesBefore)

    await open(page, linearPath)
    const pane = page.locator(".react-flow__pane")
    const paneBox = await pane.boundingBox()
    expect(paneBox).not.toBeNull()
    const clickX = paneBox!.x + paneBox!.width * 0.55
    const clickY = paneBox!.y + paneBox!.height * 0.45
    await page.mouse.click(clickX, clickY, { button: "right" })
    await expect(page.getByTestId("capability-menu")).toBeVisible()
    await page.getByTestId("capability-menu-search").fill("echo")
    const row = page.getByTestId("capability-menu-item-@executioncontrolprotocol/test.echo")
    await expect(row).toHaveAttribute("data-active", "true", { timeout: 15_000 })
    await page.getByTestId("capability-menu-search").press("Enter")
    await expect(page.getByTestId("ecp-step-echo")).toBeVisible({ timeout: 15_000 })
    // The node can render for a frame at its layout position before the cursor override applies; check where it settles.
    await expect
      .poll(
        async () => {
          const box = await page.getByTestId("ecp-step-echo").boundingBox()
          return box ? Math.hypot(box.x - clickX, box.y - clickY) : Number.POSITIVE_INFINITY
        },
        { timeout: 10_000 },
      )
      .toBeLessThanOrEqual(40)

    await page.getByTestId("ecp-step-echo").click()
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-selected-node", "echo")
    await expect(page.getByTestId("ecp-step-echo")).toHaveAttribute("data-selected", "true")
  })
})