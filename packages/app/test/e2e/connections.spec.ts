import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { executionToReactFlow } from "../../src/graph/index.js"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")
const nestedBranchSource = path.join(repoRoot, "fixtures/manifests/valid/nested-branch.ecp.json")
const markersSource = path.join(repoRoot, "fixtures/manifests/valid/markers.ecp.json")
const loopForSource = path.join(repoRoot, "fixtures/manifests/valid/loop-for.ecp.json")

test.describe("Connections and edge menus", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let branchLoopPath: string
  let nestedBranchPath: string
  let markersPath: string
  let loopForPath: string

  function reset(): void {
    copyFileSync(branchLoopSource, branchLoopPath)
    copyFileSync(nestedBranchSource, nestedBranchPath)
    copyFileSync(markersSource, markersPath)
    copyFileSync(loopForSource, loopForPath)
  }

  test.beforeAll(async () => {
    harness = await startAppHarness()
    branchLoopPath = path.join(harness.workDir, "branch-loop.ecp.json")
    nestedBranchPath = path.join(harness.workDir, "nested-branch.ecp.json")
    markersPath = path.join(harness.workDir, "markers.ecp.json")
    loopForPath = path.join(harness.workDir, "loop-for.ecp.json")
    reset()
  })

  test.beforeEach(() => {
    reset()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 20_000 })
  }

  test("markers data edge delete removes binding", async ({ page }) => {
    await open(page, markersPath)
    const manifest = JSON.parse(readFileSync(markersSource, "utf8")) as ExecutionManifest
    const doc = executionToReactFlow(manifest)
    const targetEdge = doc.edges.find((edge) => edge.data.kind === "data" && edge.target === "fromExpr")
    expect(targetEdge?.id).toBeDefined()
    const rfEdge = page.locator(`.react-flow__edge[data-id="${targetEdge!.id}"]`)
    await rfEdge.click({ button: "right" })
    await expect(page.getByTestId("canvas-menu")).toBeVisible()
    await page.getByTestId("canvas-menu-item-delete-connector").click()
    await expect.poll(() => {
      const parsed = JSON.parse(readFileSync(markersPath, "utf8")) as ExecutionManifest
      const fromExpr = parsed.steps.find((step) => step.id === "fromExpr")
      return fromExpr !== undefined && !("seed" in (fromExpr.input ?? {}))
    }, { timeout: 15_000 }).toBe(true)
  })

  test("branch-loop arm delete detaches step and reconnects", async ({ page }) => {
    await open(page, branchLoopPath)
    const manifest = JSON.parse(readFileSync(branchLoopSource, "utf8")) as ExecutionManifest
    const doc = executionToReactFlow(manifest)
    const armEdge = doc.edges.find(
      (edge) =>
        edge.data.kind === "route" &&
        edge.target === "expanded" &&
        edge.data.kind === "route" &&
        edge.data.levels.some((level) => level.route === "branch"),
    )
    expect(armEdge?.id).toBeDefined()
    await page.locator(`.react-flow__edge[data-id="${armEdge!.id}"]`).click({ button: "right", force: true })
    await page.getByTestId("canvas-menu-item-delete-connector").click()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8")).toContain('"detached"')
    await expect(page.getByTestId("ecp-detached-expanded")).toBeVisible({ timeout: 15_000 })
    await page.getByTestId("tab-validation").click()
    await expect(page.getByText("ECP_NODE_DETACHED")).toBeVisible()
    const source = page
      .getByTestId("ecp-step-Seed")
      .locator('.react-flow__handle[data-handleid="output"][data-handlepos="right"]')
    const target = page
      .getByTestId("ecp-step-expanded")
      .locator('.react-flow__handle[data-handleid="value"][data-handlepos="left"]')
    const sourceBox = await source.boundingBox()
    const targetBox = await target.boundingBox()
    if (!sourceBox || !targetBox) throw new Error("missing handle boxes")
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 })
    await page.mouse.up()
    await expect.poll(() => !readFileSync(branchLoopPath, "utf8").includes('"detached"')).toBe(true)
    await expect.poll(() => {
      const parsed = JSON.parse(readFileSync(branchLoopPath, "utf8")) as ExecutionManifest
      const expanded = parsed.steps
        .flatMap((node) => (node.type === "branch" ? node.branches.flatMap((arm) => arm.steps) : [node]))
        .find((step) => step.id === "expanded") as { input?: { value?: { $ref?: string } } } | undefined
      return expanded?.input?.value?.$ref === "state.Seed"
    }).toBe(true)
    await page.getByTestId("tab-validation").click()
    await expect(page.getByTestId("validation-status")).toHaveAttribute("data-valid", "true")

    const flowHandles = page.locator(".ecp-rf-handle--flow")
    const flowCount = await flowHandles.count()
    expect(flowCount).toBeGreaterThan(0)
    for (let index = 0; index < flowCount; index += 1) {
      await expect(flowHandles.nth(index)).toHaveCSS("opacity", "0")
    }
    await expect(page.getByTestId("ecp-frame-route").locator(".react-flow__handle")).toHaveCount(0)
  })

  test("nested inner arm delete only removes inner arm", async ({ page }) => {
    await open(page, nestedBranchPath)
    const manifest = JSON.parse(readFileSync(nestedBranchSource, "utf8")) as ExecutionManifest
    const doc = executionToReactFlow(manifest)
    const innerEdge = doc.edges.find(
      (edge) =>
        edge.data.kind === "route" &&
        edge.target === "x" &&
        edge.data.kind === "route" &&
        (edge.data as { levels: Array<{ structureId?: string }> }).levels.some((level) => level.structureId === "inner"),
    )
    expect(innerEdge?.id).toBeDefined()
    await page.locator(`.react-flow__edge[data-id="${innerEdge!.id}"]`).click({ button: "right", force: true })
    await expect(page.getByTestId("canvas-menu-item-delete-connector")).toHaveText("Delete branch inner")
    await page.getByTestId("canvas-menu-item-delete-connector").click()
    const text = readFileSync(nestedBranchPath, "utf8")
    expect(text).toContain('"id": "w"')
    expect(text).toContain('"id": "outer"')
    expect(text).toMatch(/"detached"/)
    const saved = JSON.parse(text) as ExecutionManifest
    expect(saved.detached?.some((node) => node.id === "x")).toBe(true)
    expect(saved.steps.some((node) => node.id === "x")).toBe(false)
    const outer = saved.steps.find((node) => node.id === "outer")
    expect(outer?.type).toBe("branch")
    if (outer?.type === "branch") expect(outer.branches[0]?.expr).toBe("(state) => true")
  })

  test("configure default arm adds condition", async ({ page }) => {
    await open(page, nestedBranchPath)
    const layout = executionToReactFlow(JSON.parse(readFileSync(nestedBranchSource, "utf8")) as ExecutionManifest)
    const edgeToN = layout.edges.find((edge) => edge.data.kind === "route" && edge.target === "n")
    expect(edgeToN?.id).toBeDefined()
    await page.locator(`.react-flow__edge[data-id="${edgeToN!.id}"]`).click({ force: true })
    await expect(page.getByTestId("edge-arm-add-condition")).toBeVisible()
    await page.getByTestId("edge-arm-add-condition").click()
    await expect.poll(() => readFileSync(nestedBranchPath, "utf8").includes('"expr": "(state) => true"')).toBe(true)
  })

  test("make default on conditional arm removes expr and moves arm last", async ({ page }) => {
    await open(page, nestedBranchPath)
    const layout = executionToReactFlow(JSON.parse(readFileSync(nestedBranchSource, "utf8")) as ExecutionManifest)
    const edgeToN = layout.edges.find((edge) => edge.data.kind === "route" && edge.target === "n")
    const edgeToX = layout.edges.find((edge) => edge.data.kind === "route" && edge.target === "x")
    expect(edgeToN?.id).toBeDefined()
    expect(edgeToX?.id).toBeDefined()
    await page.locator(`.react-flow__edge[data-id="${edgeToN!.id}"]`).click({ force: true })
    await expect(page.getByTestId("edge-arm-add-condition")).toBeVisible()
    await page.getByTestId("edge-arm-add-condition").click()
    await expect.poll(() => {
      const parsed = JSON.parse(readFileSync(nestedBranchPath, "utf8")) as ExecutionManifest
      const outer = parsed.steps.find((node) => node.id === "outer")
      return outer?.type === "branch" && outer.branches[1]?.expr === "(state) => true"
    }).toBe(true)
    const edgeToXAfter = executionToReactFlow(JSON.parse(readFileSync(nestedBranchPath, "utf8")) as ExecutionManifest).edges.find(
      (edge) => edge.data.kind === "route" && edge.target === "x",
    )
    expect(edgeToXAfter?.id).toBeDefined()
    const makeDefaultPill = page.getByTestId(`ecp-route-label-${edgeToXAfter!.id}`)
    await makeDefaultPill.scrollIntoViewIfNeeded()
    await expect(makeDefaultPill).toHaveText("outer \u203a inner")
    await makeDefaultPill.click()
    const outerSection = page.locator('[data-testid="edge-branch-section"][data-structure-id="outer"]')
    await expect(outerSection).toBeVisible({ timeout: 15_000 })
    await outerSection.getByTestId("edge-arm-make-default").click()
    await expect.poll(() => {
      const parsed = JSON.parse(readFileSync(nestedBranchPath, "utf8")) as ExecutionManifest
      const outer = parsed.steps.find((node) => node.id === "outer")
      if (outer?.type !== "branch") return false
      const arms = outer.branches
      return (
        arms[0]?.expr !== undefined &&
        arms[1]?.expr === undefined &&
        arms[1]?.steps[0]?.id === "inner"
      )
    }).toBe(true)
  })

  test("while loop maxRounds edit writes to file", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-loop-retry").click()
    const field = page.getByTestId("loop-field-max-rounds")
    await expect(field).toBeVisible()
    await field.fill("5")
    await field.press("Enter")
    await expect.poll(() => readFileSync(branchLoopPath, "utf8").includes('"maxRounds": 5')).toBe(true)
  })

  test("for loop panel omits maxRounds field", async ({ page }) => {
    await open(page, loopForPath)
    await page.getByTestId("ecp-loop-rounds").click()
    await expect(page.getByTestId("loop-field-as")).toBeVisible()
    await expect(page.getByTestId("loop-field-max-rounds")).toHaveCount(0)
  })

  test("read-only edge menu offers Configure only", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("tab-run").click()
    await page.locator("#run-input-expand").selectOption("true")
    await page.getByTestId("ecp-run").click()
    await expect(page.getByTestId("run-status")).toHaveAttribute("data-status", "completed", { timeout: 20_000 })
    await page.getByTestId("tab-runs").click()
    await page.getByTestId("run-history-item").first().click()
    await expect(page.getByTestId("run-replay")).toBeVisible()
    await page.getByTestId("tab-graph").click()
    const dataEdge = page.locator(".react-flow__edge.ecp-rf-edge--data").first()
    await dataEdge.click({ button: "right", force: true })
    await expect(page.getByTestId("canvas-menu-item-configure")).toBeVisible()
    await expect(page.getByTestId("canvas-menu-item-delete-connector")).toHaveCount(0)
  })

  test("wrap submenu opens on hover", async ({ page }) => {
    await open(page, branchLoopPath)
    await page.getByTestId("ecp-step-expanded").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-wrap").hover()
    await expect(page.getByTestId("canvas-menu-item-wrap-branch")).toBeVisible()
  })
})