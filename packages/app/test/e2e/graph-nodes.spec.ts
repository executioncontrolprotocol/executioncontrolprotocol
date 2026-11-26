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
const ifInLoopSource = path.join(repoRoot, "examples/patterns/if-in-loop.ecp.json")

test.describe("Graph nodes (no structural edge labels)", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let nestedParallelPath: string
  let nestedForeachPath: string
  let ifInLoopPath: string

  test.beforeAll(async () => {
    harness = await startAppHarness()
    nestedParallelPath = path.join(harness.workDir, "nested-parallel.ecp.json")
    nestedForeachPath = path.join(harness.workDir, "nested-foreach-branch.ecp.json")
    ifInLoopPath = path.join(harness.workDir, "if-in-loop.ecp.json")
    copyFileSync(nestedParallelSource, nestedParallelPath)
    copyFileSync(nestedForeachSource, nestedForeachPath)
    copyFileSync(ifInLoopSource, ifInLoopPath)
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 30_000 })
  }

  test("nested parallel renders tunnels and no structural edge labels", async ({ page }) => {
    await open(page, nestedParallelPath)
    const doc = executionToReactFlow(JSON.parse(readFileSync(nestedParallelSource, "utf8")) as ExecutionManifest)
    expect(doc.edges.every((edge) => edge.data.kind === "data")).toBe(true)
    await expect(page.locator('[data-testid^="ecp-tunnel-"]').first()).toBeVisible({ timeout: 15_000 })
  })

  test("nested foreach-branch renders loop end nodes", async ({ page }) => {
    await open(page, nestedForeachPath)
    await expect(page.locator('[data-testid^="ecp-end-"]').first()).toBeVisible({ timeout: 15_000 })
  })

  test("if-in-loop: Ship input merges both branch picks; Notify reads after loop", async ({ page }) => {
    await open(page, ifInLoopPath)
    const manifest = JSON.parse(readFileSync(ifInLoopSource, "utf8")) as ExecutionManifest
    const doc = executionToReactFlow(manifest)
    const shipInputs = doc.edges.filter((edge) => edge.data.kind === "data" && edge.target === "ship")
    const pickSources = new Set(shipInputs.map((edge) => edge.source))
    expect(pickSources.has("pick-fast")).toBe(true)
    expect(pickSources.has("pick-standard")).toBe(true)
    const notifyFromShip = doc.edges.some(
      (edge) => edge.data.kind === "data" && edge.source === "ship" && edge.target === "notify",
    )
    expect(notifyFromShip).toBe(true)
    await expect(page.getByTestId("ecp-step-ship")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId("ecp-step-notify")).toBeVisible()
    await expect(page.locator(".react-flow__edge").first()).toBeVisible({ timeout: 10_000 })
    const ids = await page.locator(".react-flow__edge").evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-id") ?? ""),
    )
    expect(ids.some((id) => id.includes("pick-fast") && id.includes("ship"))).toBe(true)
    expect(ids.some((id) => id.includes("pick-standard") && id.includes("ship"))).toBe(true)
    expect(ids.some((id) => id.includes("ship") && id.includes("notify"))).toBe(true)
    await expect(page.getByTestId("ecp-tunnel-express-then")).toContainText("then")
    await expect(page.getByTestId("ecp-tunnel-express-else")).toContainText("else")
    await expect(page.getByTestId("ecp-end-end:express")).toContainText("end if")
    await expect(page.getByTestId("ecp-end-end:each-order")).toContainText("end loop")
    const shipPort = page.getByTestId("ecp-step-ship").getByText(/value.*\(2 branches\)/)
    await expect(shipPort).toBeVisible()
    const notifyPort = page.getByTestId("ecp-step-notify").getByText(/value:.*\[\]/)
    await expect(notifyPort).toBeVisible()
    const loopTunnel = await page.getByTestId("ecp-tunnel-each-order-loop").boundingBox()
    const thenTunnel = await page.getByTestId("ecp-tunnel-express-then").boundingBox()
    expect(loopTunnel && thenTunnel).toBeTruthy()
    expect(thenTunnel!.x).toBeGreaterThanOrEqual(loopTunnel!.x - 2)
    expect(thenTunnel!.y).toBeGreaterThanOrEqual(loopTunnel!.y - 2)
    expect(thenTunnel!.x + thenTunnel!.width).toBeLessThanOrEqual(loopTunnel!.x + loopTunnel!.width + 2)
    expect(thenTunnel!.y + thenTunnel!.height).toBeLessThanOrEqual(loopTunnel!.y + loopTunnel!.height + 2)
  })
})