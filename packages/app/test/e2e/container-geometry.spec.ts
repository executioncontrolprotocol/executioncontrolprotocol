import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const patternsDir = path.join(repoRoot, "examples/patterns")

const examples = [
  "branch.ecp.json",
  "loop-for.ecp.json",
  "loop-foreach.ecp.json",
  "nested-foreach-branch.ecp.json",
  "nested-parallel.ecp.json",
  "if-in-loop.ecp.json",
] as const

test.describe("Tunnel geometry", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  const paths = new Map<string, string>()

  test.beforeAll(async () => {
    harness = await startAppHarness()
    for (const name of examples) {
      const src = path.join(patternsDir, name)
      const dest = path.join(harness.workDir, name)
      copyFileSync(src, dest)
      paths.set(name, dest)
    }
  })

  test.afterAll(async () => harness.stop())

  async function open(page: Page, name: string): Promise<void> {
    const manifestPath = paths.get(name)
    if (!manifestPath) throw new Error(`missing ${name}`)
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 25_000 })
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 15_000 })
  }

  async function box(page: Page, testId: string) {
    const el = page.getByTestId(testId)
    await expect(el).toBeVisible()
    return el.boundingBox()
  }

  function contains(outer: NonNullable<Awaited<ReturnType<typeof box>>>, inner: NonNullable<Awaited<ReturnType<typeof box>>>): void {
    expect(inner.x).toBeGreaterThanOrEqual(outer.x - 2)
    expect(inner.y).toBeGreaterThanOrEqual(outer.y - 2)
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 2)
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 2)
  }

  for (const name of examples) {
    test(`${name}: step nodes sit inside their loop tunnel when present`, async ({ page }) => {
      await open(page, name)
      const parsed = JSON.parse(readFileSync(paths.get(name)!, "utf8")) as {
        steps: Array<{ type?: string; id: string; steps?: Array<{ type?: string; id: string }> }>
      }
      const firstLoop = parsed.steps.find((step) => step.type === "loop")
      if (!firstLoop) return
      const tunnel = await box(page, `ecp-tunnel-${firstLoop.id}-loop`)
      const bodyStep = firstLoop.steps?.[0]
      if (!bodyStep) return
      const stepId = bodyStep.type === "if" ? `ecp-if-${bodyStep.id}` : `ecp-step-${bodyStep.id}`
      const step = await box(page, stepId)
      contains(tunnel!, step!)
    })
  }

  test("branch: then and else tunnels visible; tier branch renders", async ({ page }) => {
    await open(page, "branch.ecp.json")
    const thenTunnel = await box(page, "ecp-tunnel-by-tier-then")
    const elseTunnel = await box(page, "ecp-tunnel-by-tier-else")
    expect(thenTunnel && elseTunnel).toBeTruthy()
    const layer = page.getByTestId("ecp-rail-layer")
    await expect(layer.getByTestId("ecp-side-label-by-tier-then")).toHaveText("then")
    await expect(layer.getByTestId("ecp-side-label-by-tier-else")).toHaveText("else")
    await expect(page.locator(".react-flow__edge").first()).toBeVisible({ timeout: 10_000 })
    const ids = await page.locator(".react-flow__edge").evaluateAll((els) => els.map((el) => el.getAttribute("data-id") ?? ""))
    expect(ids.some((id) => id.includes("by-tier") && id.includes("tier"))).toBe(true)
  })

  function disjoint(
    a: NonNullable<Awaited<ReturnType<typeof box>>>,
    b: NonNullable<Awaited<ReturnType<typeof box>>>,
  ): void {
    const overlap =
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height
    expect(overlap).toBe(false)
  }

  test("if-in-loop: nested if tunnels inside loop tunnel; end labels visible", async ({ page }) => {
    await open(page, "if-in-loop.ecp.json")
    const loopTunnel = await box(page, "ecp-tunnel-each-order-loop")
    const thenTunnel = await box(page, "ecp-tunnel-express-then")
    const elseTunnel = await box(page, "ecp-tunnel-express-else")
    contains(loopTunnel!, thenTunnel!)
    contains(loopTunnel!, elseTunnel!)
    disjoint(thenTunnel!, elseTunnel!)
    const fast = await box(page, "ecp-step-pick-fast")
    const standard = await box(page, "ecp-step-pick-standard")
    contains(thenTunnel!, fast!)
    expect(standard!.y + standard!.height).toBeLessThanOrEqual(elseTunnel!.y + elseTunnel!.height + 2)
    expect(fast!.y).toBeGreaterThanOrEqual(thenTunnel!.y - 2)
    await expect(page.getByTestId("ecp-end-end:each-order:loop")).toContainText("end loop")
    await expect(page.getByTestId("ecp-end-end:express:then")).toContainText("end then")
    await expect(page.getByTestId("ecp-end-end:express:else")).toContainText("end else")
    const layer = page.getByTestId("ecp-rail-layer")
    await expect(layer.getByTestId("ecp-side-express-then")).toHaveAttribute("stroke", "#3fb950")
    await expect(layer.getByTestId("ecp-side-express-else")).toHaveAttribute("stroke", "#f85149")
  })

  async function verticalCenter(page: Page, testId: string): Promise<number> {
    const rect = await box(page, testId)
    return rect!.y + rect!.height / 2
  }

  test("if-in-loop: each end marker shares vertical centre with its side", async ({ page }) => {
    await open(page, "if-in-loop.ecp.json")
    const endThen = await verticalCenter(page, "ecp-end-end:express:then")
    const fast = await verticalCenter(page, "ecp-step-pick-fast")
    const endElse = await verticalCenter(page, "ecp-end-end:express:else")
    const standard = await verticalCenter(page, "ecp-step-pick-standard")
    expect(Math.abs(endThen - fast)).toBeLessThan(8)
    expect(Math.abs(endElse - standard)).toBeLessThan(8)
  })

  test("branch: top-level inputs and done share vertical centre", async ({ page }) => {
    await open(page, "branch.ecp.json")
    const accepts = await verticalCenter(page, "ecp-io-accepts")
    const done = await verticalCenter(page, "ecp-step-done")
    expect(Math.abs(accepts - done)).toBeLessThan(12)
  })

  test("branch: sibling tubes disjoint; inner if inside outer else", async ({ page }) => {
    await open(page, "branch.ecp.json")
    const thenTunnel = await box(page, "ecp-tunnel-by-tier-then")
    const elseTunnel = await box(page, "ecp-tunnel-by-tier-else")
    disjoint(thenTunnel!, elseTunnel!)
    const innerThen = await box(page, "ecp-tunnel-by-tier-silver-then")
    const innerElse = await box(page, "ecp-tunnel-by-tier-silver-else")
    contains(elseTunnel!, innerThen!)
    contains(elseTunnel!, innerElse!)
    disjoint(innerThen!, innerElse!)
    await expect(page.getByTestId("ecp-rail-layer").getByTestId("ecp-side-by-tier-then")).toHaveAttribute("stroke", "#3fb950")
  })
})