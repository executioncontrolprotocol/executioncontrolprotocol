import { copyFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const ifInLoopSource = path.join(repoRoot, "examples/patterns/if-in-loop.ecp.json")

test.describe("Rail phase 3 branch routing", () => {
  let harness: AppE2eHarness

  test.beforeAll(async () => {
    harness = await startAppHarness()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page): Promise<void> {
    const manifestPath = path.join(harness.workDir, "rail3-if-in-loop.ecp.json")
    copyFileSync(ifInLoopSource, manifestPath)
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
  }

  test("Pick fast to Ship path stays inside then band and join", async ({ page }) => {
    await open(page)
    await expect(page.getByTestId("ecp-rail-layer")).toBeVisible({ timeout: 15_000 })
    const edgePath = page.locator('.react-flow__edge[data-id*="pick-fast-ship"] path.react-flow__edge-path').first()
    await expect(edgePath).toBeVisible({ timeout: 10_000 })
    const edgeBox = await edgePath.boundingBox()
    const thenBand = page.getByTestId("ecp-side-express-then")
    const thenJoin = page.getByTestId("ecp-join-express-then")
    const ship = page.getByTestId("ecp-step-ship")
    expect(edgeBox).toBeTruthy()
    const thenBox = await thenBand.boundingBox()
    const joinBox = await thenJoin.boundingBox()
    const shipBox = await ship.boundingBox()
    expect(thenBox && joinBox && shipBox).toBeTruthy()
    const unions = [thenBox!, joinBox!, shipBox!]
    const cx = edgeBox!.x + edgeBox!.width / 2
    const cy = edgeBox!.y + edgeBox!.height / 2
    const inside = unions.some(
      (box) => cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height,
    )
    expect(inside).toBe(true)
  })

  test("data edge paths start and end on port handle centres", async ({ page }) => {
    await open(page)
    const tolerance = 1.5
    const result = await page.evaluate((tol) => {
      const toScreen = (path: SVGPathElement, point: DOMPoint): { x: number; y: number } => {
        const ctm = path.getScreenCTM()
        if (!ctm) return { x: point.x, y: point.y }
        const transformed = point.matrixTransform(ctm)
        return { x: transformed.x, y: transformed.y }
      }
      const centre = (element: Element): { x: number; y: number } => {
        const box = element.getBoundingClientRect()
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
      const failures: string[] = []
      const paths = [...document.querySelectorAll(".react-flow__edge.ecp-rf-edge--data path.react-flow__edge-path")]
      for (const path of paths) {
        const edge = path.closest(".react-flow__edge")
        const edgeId = edge?.getAttribute("data-id") ?? ""
        const dataSource = edge?.getAttribute("data-source") ?? ""
        const dataTarget = edge?.getAttribute("data-target") ?? ""
        const sourceHandle = document.querySelector(
          `.react-flow__node[data-id="${dataSource}"] .react-flow__handle.source`,
        )
        const targetHandle = document.querySelector(
          `.react-flow__node[data-id="${dataTarget}"] .react-flow__handle.target`,
        )
        if (!sourceHandle || !targetHandle) continue
        const start = toScreen(path, new DOMPoint(path.getPointAtLength(0).x, path.getPointAtLength(0).y))
        const endPoint = path.getPointAtLength(path.getTotalLength())
        const end = toScreen(path, new DOMPoint(endPoint.x, endPoint.y))
        const source = centre(sourceHandle)
        const target = centre(targetHandle)
        if (Math.hypot(start.x - source.x, start.y - source.y) > tol) failures.push(`${edgeId} start`)
        if (Math.hypot(end.x - target.x, end.y - target.y) > tol) failures.push(`${edgeId} end`)
      }
      return failures
    }, tolerance)
    expect(result).toEqual([])
  })

  test("end labels render above data edge strokes", async ({ page }) => {
    await open(page)
    const endThen = page.getByTestId("ecp-end-end:express:then")
    const edgePath = page.locator(".react-flow__edge.ecp-rf-edge--data path.react-flow__edge-path").first()
    await expect(endThen).toBeVisible({ timeout: 15_000 })
    await expect(edgePath).toBeVisible()
    const endBox = await endThen.boundingBox()
    expect(endBox).toBeTruthy()
    const topAtEnd = await page.evaluate(
      ({ x, y }) => {
        const hit = document.elementFromPoint(x, y)
        return hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? ""
      },
      { x: endBox!.x + endBox!.width / 2, y: endBox!.y + endBox!.height / 2 },
    )
    expect(topAtEnd).toContain("ecp-end-end:express:then")
  })
})