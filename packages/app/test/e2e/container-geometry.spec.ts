import { copyFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const patternsDir = path.join(repoRoot, "examples/patterns")

const examples = [
  "branch.ecp.json",
  "loop-while.ecp.json",
  "nested-foreach-branch.ecp.json",
  "nested-parallel.ecp.json",
] as const

test.describe("Container geometry", () => {
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

  for (const name of examples) {
    test(`${name}: start straddles left edge and loop end the right when present`, async ({ page }) => {
      await open(page, name)
      const parsed = JSON.parse(readFileSync(paths.get(name)!, "utf8")) as {
        steps: Array<{ type?: string; id: string }>
      }
      const firstIf = parsed.steps.find((step) => step.type === "if")
      const firstLoop = parsed.steps.find((step) => step.type === "loop")
      // Centres within 2 screen pixels of the dotted stroke.
      const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(2)
      if (firstIf) {
        const frame = await box(page, `ecp-frame-${firstIf.id}`)
        const start = await box(page, `ecp-if-${firstIf.id}`)
        near(start!.x + start!.width / 2, frame!.x)
      }
      if (firstLoop) {
        const frame = await box(page, `ecp-frame-${firstLoop.id}`)
        const start = await box(page, `ecp-loop-${firstLoop.id}`)
        const end = await box(page, `ecp-end-end:${firstLoop.id}`)
        near(start!.x + start!.width / 2, frame!.x)
        near(end!.x + end!.width / 2, frame!.x + frame!.width)
      }
    })
  }

  test("branch: then band above else; tier branch renders", async ({ page }) => {
    await open(page, "branch.ecp.json")
    const thenStep = await box(page, "ecp-step-gold-offer")
    const elseBand = await box(page, "ecp-if-by-tier-silver")
    expect(thenStep && elseBand).toBeTruthy()
    expect(thenStep!.y + thenStep!.height).toBeLessThan(elseBand!.y)
    await expect(page.locator(".react-flow__edge").first()).toBeVisible({ timeout: 10_000 })
    const ids = await page.locator(".react-flow__edge").evaluateAll((els) => els.map((el) => el.getAttribute("data-id") ?? ""))
    expect(ids.some((id) => id.includes("by-tier") && id.includes("tier"))).toBe(true)
  })

  test("loop-while: repeat branch into end", async ({ page }) => {
    await open(page, "loop-while.ecp.json")
    await expect(page.locator(".react-flow__edge").first()).toBeVisible({ timeout: 10_000 })
    const ids = await page.locator(".react-flow__edge").evaluateAll((els) => els.map((el) => el.getAttribute("data-id") ?? ""))
    expect(ids.some((id) => id.includes("end:retry") && id.includes("repeat"))).toBe(true)
  })
})