import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { CONTROL_NODE_ENTRY_ID } from "../../src/graph/index.js"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

/** The bundled transform (plugin-core); the App finds it by its manifest, the test names it. */
const TRANSFORM_CAPABILITY_ID = "@executioncontrolprotocol/core.transform"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchSource = path.join(repoRoot, "examples/patterns/branch.ecp.json")
const parallelSource = path.join(repoRoot, "examples/patterns/parallel.ecp.json")

test.describe("Hand-add control nodes, transforms and paths", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let branchPath: string
  let parallelPath: string

  test.beforeAll(async () => {
    harness = await startAppHarness()
    branchPath = path.join(harness.workDir, "hand-branch.ecp.json")
    parallelPath = path.join(harness.workDir, "hand-parallel.ecp.json")
    copyFileSync(branchSource, branchPath)
    copyFileSync(parallelSource, parallelPath)
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 30_000 })
  }

  async function dragHandleToEmpty(page: Page, from: string, offsetX = 280, offsetY = 140): Promise<void> {
    const source = page.locator(from)
    const box = await source.boundingBox()
    if (!box) throw new Error("missing handle")
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + offsetX, box.y + offsetY, { steps: 18 })
    await page.mouse.up()
    await expect(page.getByTestId("capability-menu")).toBeVisible()
  }

  test("drag tier to canvas and pick control node", async ({ page }) => {
    await open(page, branchPath)
    await dragHandleToEmpty(
      page,
      '[data-testid="ecp-io-accepts"] .react-flow__handle[data-handleid="tier"][data-handlepos="right"]',
    )
    await page.getByTestId(`capability-menu-item-${CONTROL_NODE_ENTRY_ID}`).click()
  const json = () => JSON.parse(readFileSync(branchPath, "utf8")) as ExecutionManifest
    await expect.poll(() => {
      const manifest = json()
      const gate = manifest.steps.find((node) => node.type === "if" && node.accepts?.properties?.tier)
      return (
        gate?.type === "if" &&
        gate.input?.tier &&
        (gate.input.tier as { $ref?: string }).$ref === "state.tier"
      )
    }, { timeout: 20_000 }).toBe(true)
    await page.getByTestId("tab-validation").click()
    await expect(page.getByTestId("validation-status")).toHaveAttribute("data-valid", "false", { timeout: 10_000 })
    const issues = page.getByTestId("validation-issue")
    await expect(issues).toHaveCount(1)
    await expect(issues.first()).toContainText("`then` has no nodes")
  })

  async function addTransformFromMenu(page: Page): Promise<void> {
    const pane = page.locator(".react-flow__pane")
    const box = await pane.boundingBox()
    if (!box) throw new Error("missing canvas pane")
    await page.mouse.click(box.x + 12, box.y + 12, { button: "right" })
    await expect(page.getByTestId("capability-menu")).toBeVisible()
    await page.getByTestId("capability-menu-search").fill("transform")
    const row = page.getByTestId(`capability-menu-item-${TRANSFORM_CAPABILITY_ID}`)
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()
  }

  test("add transform then wire tier onto empty port", async ({ page }) => {
    copyFileSync(branchSource, branchPath)
    await open(page, branchPath)
    await addTransformFromMenu(page)
    await expect(page.getByTestId("structure-edit-error")).toHaveCount(0)
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 30_000 })
    await expect.poll(() => readFileSync(branchPath, "utf8").includes(TRANSFORM_CAPABILITY_ID), { timeout: 30_000 }).toBe(
      true,
    )
    await expect
      .poll(() => readFileSync(branchPath, "utf8").includes(TRANSFORM_CAPABILITY_ID), { timeout: 15_000 })
      .toBe(true)
    const transformId = (
      JSON.parse(readFileSync(branchPath, "utf8")) as ExecutionManifest
    ).steps.find((node) => node.uses === TRANSFORM_CAPABILITY_ID)?.id
    expect(transformId).toBeTruthy()
    await page.getByTestId(`ecp-step-${transformId}`).scrollIntoViewIfNeeded()
    const source = page.locator(
      '[data-testid="ecp-io-accepts"] .react-flow__handle[data-handleid="tier"][data-handlepos="right"]',
    )
    const target = page.locator(
      `[data-testid="ecp-step-${transformId}"] .react-flow__handle[data-handleid="__empty"][data-handlepos="left"]`,
    )
    await expect(target).toBeVisible({ timeout: 10_000 })
    await source.dragTo(target, { force: true })
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 30_000 })
    await expect.poll(() => {
      const manifest = JSON.parse(readFileSync(branchPath, "utf8")) as ExecutionManifest
      const step = manifest.steps.find((node) => node.id === transformId) as {
        accepts?: { properties?: Record<string, unknown> }
        input?: Record<string, unknown>
      }
      const tier = step?.accepts?.properties?.tier as { type?: string } | undefined
      return (
        tier?.type === "string" &&
        (step?.input?.tier as { $ref?: string })?.$ref === "state.tier"
      )
    }, { timeout: 30_000 }).toBe(true)
    await expect(
      page.locator(`[data-testid="ecp-step-${transformId}"] .react-flow__handle[data-handleid="__empty"]`),
    ).toBeVisible()
  })

  test("drag tier to canvas picks transform in one step and one undo removes both", async ({ page }) => {
    copyFileSync(branchSource, branchPath)
    await open(page, branchPath)
    const before = readFileSync(branchPath, "utf8")
    await dragHandleToEmpty(
      page,
      '[data-testid="ecp-io-accepts"] .react-flow__handle[data-handleid="tier"][data-handlepos="right"]',
    )
    await addTransformFromMenu(page)
    await expect.poll(() => readFileSync(branchPath, "utf8").includes(TRANSFORM_CAPABILITY_ID), { timeout: 15_000 }).toBe(
      true,
    )
    await expect(page.getByTestId("canvas-undo")).toBeEnabled({ timeout: 10_000 })
    await page.getByTestId("canvas-undo").click()
    await expect.poll(() => readFileSync(branchPath, "utf8"), { timeout: 15_000 }).toBe(before)
  })

  test("Add path on parallel then add node in path 4", async ({ page }) => {
    await open(page, parallelPath)
    await page.getByTestId("ecp-parallel-research").click()
    await page.getByTestId("control-add-path").click()
    await expect.poll(() => {
      const manifest = JSON.parse(readFileSync(parallelPath, "utf8")) as ExecutionManifest
      const parallel = manifest.steps.find((node) => node.id === "research")
      return parallel?.type === "parallel" && parallel.paths.length === 4
    }, { timeout: 15_000 }).toBe(true)
    await expect(page.getByTestId("ecp-tunnel-research-path-4")).toBeVisible({ timeout: 10_000 })
    await page.getByTestId("ecp-parallel-research").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-add-path-4").click()
    await page.getByTestId("capability-menu-search").fill("echo")
    await page.getByTestId("capability-menu-item-@executioncontrolprotocol/test.echo").click()
    await expect.poll(() => {
      const manifest = JSON.parse(readFileSync(parallelPath, "utf8")) as ExecutionManifest
      const parallel = manifest.steps.find((node) => node.id === "research")
      return parallel?.type === "parallel" && parallel.paths[3]?.some((node) => node.uses?.includes("echo"))
    }, { timeout: 15_000 }).toBe(true)
  })

  test("add control node then echo in then clears empty-then validation", async ({ page }) => {
    copyFileSync(branchSource, branchPath)
    await open(page, branchPath)
    const pane = page.locator(".react-flow__pane")
    const box = await pane.boundingBox()
    if (!box) throw new Error("missing canvas pane")
    await page.mouse.click(box.x + 12, box.y + 12, { button: "right" })
    await page.getByTestId(`capability-menu-item-${CONTROL_NODE_ENTRY_ID}`).click()
    let ifId = ""
    await expect
      .poll(() => {
        const manifest = JSON.parse(readFileSync(branchPath, "utf8")) as ExecutionManifest
        const gate = manifest.steps.find(
          (node) =>
            node.type === "if" &&
            node.id !== "by-tier" &&
            node.expression === "true" &&
            Array.isArray(node.then) &&
            node.then.length === 0,
        )
        ifId = gate?.id ?? ""
        return ifId.length > 0
      }, { timeout: 15_000 })
      .toBe(true)
    await page.getByTestId(`ecp-if-${ifId}`).click({ button: "right" })
    await page.getByTestId("canvas-menu-item-add-then").click()
    await page.getByTestId("capability-menu-item-@executioncontrolprotocol/test.echo").click()
    await expect.poll(() => {
      const manifest = JSON.parse(readFileSync(branchPath, "utf8")) as ExecutionManifest
      const gate = manifest.steps.find((node) => node.id === ifId)
      return gate?.type === "if" && gate.then.length > 0
    }, { timeout: 15_000 }).toBe(true)
    await page.getByTestId("tab-validation").click()
    await expect(page.getByTestId("validation-status")).toHaveAttribute("data-valid", "true", { timeout: 15_000 })
  })
})