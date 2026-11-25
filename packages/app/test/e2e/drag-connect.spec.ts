import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { executionToReactFlow } from "../../src/graph/index.js"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

test.describe("Drag data connections", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let manifestPath: string

  const fixtureManifest = (): ExecutionManifest => ({
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      {
        id: "writer",
        uses: "@executioncontrolprotocol/test.bounded",
        input: { text: "seed" },
        as: "writer",
      },
      {
        id: "later",
        uses: "@executioncontrolprotocol/test.bounded",
        input: { text: "keep" },
        as: "later",
      },
      {
        id: "count",
        uses: "@executioncontrolprotocol/test.delay",
        input: { ms: 1 },
        as: "count",
      },
    ],
  })

  function reset(): void {
    writeFileSync(manifestPath, `${JSON.stringify(fixtureManifest(), null, 2)}\n`, "utf8")
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    manifestPath = path.join(harness.workDir, "drag-connect.ecp.json")
    reset()
  })

  test.beforeEach(() => {
    reset()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
  }

  async function dragHandle(page: Page, from: string, to: string): Promise<void> {
    const source = page.locator(from)
    const target = page.locator(to)
    const sourceBox = await source.boundingBox()
    const targetBox = await target.boundingBox()
    if (!sourceBox || !targetBox) throw new Error("missing handle")
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 14 })
    await page.mouse.up()
  }

  test("connects compatible ports and draws the data edge", async ({ page }) => {
    await open(page)
    await dragHandle(
      page,
      '[data-testid="ecp-step-writer"] .react-flow__handle[data-handleid="text"][data-handlepos="right"]',
      '[data-testid="ecp-step-later"] .react-flow__handle[data-handleid="text"][data-handlepos="left"]',
    )
    await expect.poll(() => readFileSync(manifestPath, "utf8")).toContain("state.writer.text")
    const doc = executionToReactFlow(JSON.parse(readFileSync(manifestPath, "utf8")))
    const edge = doc.edges.find((entry) => entry.data.kind === "data" && entry.target === "later")
    expect(edge?.id).toBeDefined()
    await expect(page.locator(`.react-flow__edge[data-id="${edge!.id}"]`)).toBeVisible()
  })

  test("dims incompatible ports while dragging", async ({ page }) => {
    await open(page)
    const source = page.locator(
      '[data-testid="ecp-step-writer"] .react-flow__handle[data-handleid="text"][data-handlepos="right"]',
    )
    const target = page.locator(
      '[data-testid="ecp-step-count"] .react-flow__handle[data-handleid="ms"][data-handlepos="left"]',
    )
    const sourceBox = await source.boundingBox()
    const targetBox = await target.boundingBox()
    if (!sourceBox || !targetBox) throw new Error("missing handle")
    const before = readFileSync(manifestPath, "utf8")
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 })
    await expect(target).toHaveAttribute("data-incompatible", "true")
    await page.mouse.up()
    expect(readFileSync(manifestPath, "utf8")).toBe(before)
  })

  test("refuses out-of-order connections", async ({ page }) => {
    await open(page)
    const before = readFileSync(manifestPath, "utf8")
    await dragHandle(
      page,
      '[data-testid="ecp-step-later"] .react-flow__handle[data-handleid="text"][data-handlepos="right"]',
      '[data-testid="ecp-step-writer"] .react-flow__handle[data-handleid="text"][data-handlepos="left"]',
    )
    expect(readFileSync(manifestPath, "utf8")).toBe(before)
    await expect(page.getByTestId("structure-edit-error")).toContainText("That output is not produced before this step")
  })

  test("drop on empty canvas inserts wired echo", async ({ page }) => {
    await open(page)
    const source = page.locator(
      '[data-testid="ecp-step-writer"] .react-flow__handle[data-handleid="text"][data-handlepos="right"]',
    )
    const box = await source.boundingBox()
    if (!box) throw new Error("missing handle")
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 240, box.y + 120, { steps: 16 })
    await page.mouse.up()
    await expect(page.getByTestId("capability-menu")).toBeVisible()
    await page.getByTestId("capability-menu-search").fill("echo")
    const row = page.getByTestId("capability-menu-item-@executioncontrolprotocol/test.echo")
    await expect(row).toHaveAttribute("data-active", "true", { timeout: 15_000 })
    await row.click()
    await expect.poll(() => {
      const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as ExecutionManifest
      const echoStep = parsed.steps.find((step) => step.id === "echo") as {
        input?: { value?: { $ref?: string } }
      }
      const writerIndex = parsed.steps.findIndex((step) => step.id === "writer")
      const echoIndex = parsed.steps.findIndex((step) => step.id === "echo")
      return echoIndex === writerIndex + 1 && echoStep?.input?.value?.$ref === "state.writer.text"
    }).toBe(true)
  })

  test("replay makes data handles non-connectable", async ({ page }) => {
    await open(page)
    await page.getByTestId("tab-run").click()
    await page.getByTestId("ecp-run").click()
    await expect(page.getByTestId("run-status")).toHaveAttribute("data-status", "completed", { timeout: 20_000 })
    await page.getByTestId("tab-runs").click()
    await page.getByTestId("run-history-item").first().click()
    await expect(page.getByTestId("run-replay")).toBeVisible()
    await page.getByTestId("tab-graph").click()
    const handle = page.locator(
      '[data-testid="ecp-step-writer"] .react-flow__handle[data-handleid="text"][data-handlepos="right"]',
    )
    await expect(handle).not.toHaveClass(/connectable/)
  })
})