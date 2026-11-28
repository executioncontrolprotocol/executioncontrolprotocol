import { copyFileSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const ifInLoopSource = path.join(repoRoot, "examples/patterns/if-in-loop.ecp.json")

function loopElseIds(manifest: ExecutionManifest): string {
  const loop = manifest.steps[0]
  if (loop?.type !== "loop") return ""
  const express = loop.steps.find((node) => node.id === "express")
  if (express?.type !== "if") return ""
  return express.else?.map((node) => node.id).join(",") ?? ""
}

function loopStepIds(manifest: ExecutionManifest): string {
  const loop = manifest.steps[0]
  if (loop?.type !== "loop") return ""
  return loop.steps.map((node) => node.id).join(",")
}

function rootStepIds(manifest: ExecutionManifest): string {
  return manifest.steps.map((node) => node.id).join(",")
}

test.describe("Marker and scope drag", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness
  let ifInLoopPath: string
  let detachedPath: string
  let baselineIfInLoop: ExecutionManifest

  test.beforeAll(async () => {
    harness = await startAppHarness()
    ifInLoopPath = path.join(harness.workDir, "marker-if-in-loop.ecp.json")
    detachedPath = path.join(harness.workDir, "marker-detached.ecp.json")
    copyFileSync(ifInLoopSource, ifInLoopPath)
    baselineIfInLoop = JSON.parse(readFileSync(ifInLoopSource, "utf8")) as ExecutionManifest
    writeFileSync(
      detachedPath,
      JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "A",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "a" },
            as: "A",
          },
        ],
        detached: [
          {
            id: "late",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "late" },
            as: "late",
          },
        ],
      } satisfies ExecutionManifest),
    )
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function open(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 30_000 })
  }

  test("if-in-loop: drag end else past Ship, undo, then node into loop band", async ({ page }) => {
    await open(page, ifInLoopPath)
    const ship = await page.getByTestId("ecp-step-ship").boundingBox()
    const endElse = await page.getByTestId("ecp-end-end:express:else").boundingBox()
    expect(ship && endElse).toBeTruthy()
    const endCx = endElse!.x + endElse!.width / 2
    const endCy = endElse!.y + endElse!.height / 2
    const targetX = ship!.x + ship!.width / 2 + 60
    await page.mouse.move(endCx, endCy)
    await page.mouse.down()
    await page.mouse.move(targetX, endCy, { steps: 24 })
    await page.mouse.up()
    await expect.poll(() => loopElseIds(JSON.parse(readFileSync(ifInLoopPath, "utf8")) as ExecutionManifest)).toBe(
      "pick-standard,ship",
    )
    const afterMarker = JSON.parse(readFileSync(ifInLoopPath, "utf8")) as ExecutionManifest
    expect(loopStepIds(afterMarker)).toBe("express")
    expect(rootStepIds(afterMarker)).toBe("each-order,notify")
    expect(loopElseIds(afterMarker)).toBe("pick-standard,ship")
    await page.getByRole("button", { name: "Undo" }).click()
    await expect.poll(() => loopStepIds(JSON.parse(readFileSync(ifInLoopPath, "utf8")) as ExecutionManifest)).toBe(
      "express,ship",
    )
    const restored = JSON.parse(readFileSync(ifInLoopPath, "utf8")) as ExecutionManifest
    expect(loopElseIds(restored)).toBe(loopElseIds(baselineIfInLoop))
    expect(loopStepIds(restored)).toBe(loopStepIds(baselineIfInLoop))

    const notify = await page.getByTestId("ecp-step-notify").boundingBox()
    const tunnel = page.locator('.react-flow__node[data-id="ecp:tunnel:each-order:loop"]')
    await expect(tunnel).toBeVisible()
    const tunnelBox = await tunnel.boundingBox()
    expect(notify && tunnelBox).toBeTruthy()
    await page.mouse.move(notify!.x + notify!.width / 2, notify!.y + notify!.height / 2)
    await page.mouse.down()
    await page.mouse.move(tunnelBox!.x + 100, tunnelBox!.y + tunnelBox!.height / 2, { steps: 20 })
    await page.mouse.up()
    await expect
      .poll(() => {
        const manifest = JSON.parse(readFileSync(ifInLoopPath, "utf8")) as ExecutionManifest
        return rootStepIds(manifest)
      })
      .toBe("each-order")
    await expect
      .poll(() => {
        const manifest = JSON.parse(readFileSync(ifInLoopPath, "utf8")) as ExecutionManifest
        const ids = loopStepIds(manifest)
        return ids.includes("notify") ? ids : ""
      })
      .not.toBe("")
    await page.getByRole("button", { name: "Undo" }).click()
    await expect.poll(() => rootStepIds(JSON.parse(readFileSync(ifInLoopPath, "utf8")) as ExecutionManifest)).toBe(
      "each-order,notify",
    )
  })

  test("detached step dragged onto the loop body reattaches", async ({ page }) => {
    const ifPath = path.join(harness.workDir, "marker-if-for-detached.ecp.json")
    copyFileSync(ifInLoopSource, ifPath)
    await open(page, ifPath)
    writeFileSync(
      ifPath,
      JSON.stringify({
        ...(JSON.parse(readFileSync(ifInLoopSource, "utf8")) as ExecutionManifest),
        detached: [
          {
            id: "late",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "late" },
            as: "late",
          },
        ],
      } satisfies ExecutionManifest),
    )
    await page.reload()
    await expect(page.getByTestId("ecp-step-late")).toBeVisible({ timeout: 15_000 })
    const tunnel = page.locator('.react-flow__node[data-id="ecp:tunnel:each-order:loop"]')
    const detached = page.getByTestId("ecp-step-late")
    await expect(tunnel).toBeVisible()
    const tunnelBox = await tunnel.boundingBox()
    const detachedBox = await detached.boundingBox()
    expect(tunnelBox && detachedBox).toBeTruthy()
    await page.mouse.move(detachedBox!.x + detachedBox!.width / 2, detachedBox!.y + detachedBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(tunnelBox!.x + 120, tunnelBox!.y + tunnelBox!.height / 2, { steps: 16 })
    await page.mouse.up()
    await expect
      .poll(() => {
        const manifest = JSON.parse(readFileSync(ifPath, "utf8")) as ExecutionManifest
        if (manifest.detached?.length) return "detached"
        const loop = manifest.steps[0]
        if (loop?.type !== "loop") return "no-loop"
        return loop.steps.some((node) => node.id === "late") ? "ok" : "missing"
      })
      .toBe("ok")
  })
})