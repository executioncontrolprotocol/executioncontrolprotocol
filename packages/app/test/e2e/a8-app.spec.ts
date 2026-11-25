import { readFileSync, writeFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

test.describe("A8 App", () => {
  let harness: AppE2eHarness

  test.beforeAll(async () => {
    harness = await startAppHarness()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function openPath(page: Page, filePath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: filePath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 15_000 })
  }

  test("no token shows unauthorized", async ({ page }) => {
    await page.goto(`${harness.baseUrl}/app/`)
    await expect(page.getByTestId("unauthorized")).toBeVisible()
  })

  test("home lists dir files and opens by path", async ({ page }) => {
    await page.goto(appUrl(harness.baseUrl, harness.token, { dir: harness.workDir }))
    await expect(page.getByTestId("home-view")).toBeVisible({ timeout: 15_000 })
    const files = page.getByTestId("home-file")
    await expect(files.first()).toBeVisible()
    await expect(files).toHaveCount(5) // demo, scripted, typed, parallel, nested/other
    await page.getByTestId("home-file").filter({ hasText: "demo.ecp.json" }).click()
    await expect(page.getByTestId("workspace")).toBeVisible()
    await expect(page.getByTestId("graph-canvas")).toBeVisible()
  })

  test("validation errors select nodes; fix file hot-reloads", async ({ page }) => {
    await openPath(page, harness.demoPath)

    const broken = JSON.parse(readFileSync(harness.demoPath, "utf8")) as Record<string, unknown>
    broken.steps = [
      {
        id: "echo",
        uses: "@executioncontrolprotocol/test.missing",
        input: { value: { $ref: "state.message" } },
        as: "out",
      },
    ]
    writeFileSync(harness.demoPath, `${JSON.stringify(broken, null, 2)}\n`)

    await expect(page.getByTestId("validation-status")).toHaveAttribute("data-valid", "false", {
      timeout: 5_000,
    })
    await page.getByTestId("tab-validation").click()
    await expect(page.getByTestId("validation-issue").first()).toBeVisible()
    await page.getByTestId("validation-issue").first().click()
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-selected-node", "echo")
    await expect(page.getByTestId("ecp-step-echo")).toHaveAttribute("data-invalid", "true")

    const good = JSON.parse(readFileSync(harness.demoPath, "utf8")) as Record<string, unknown>
    good.steps = [
      {
        id: "echo",
        uses: "@executioncontrolprotocol/test.echo",
        input: { value: { $ref: "state.message" } },
        as: "out",
      },
    ]
    writeFileSync(harness.demoPath, `${JSON.stringify(good, null, 2)}\n`)
    await expect(page.getByTestId("validation-clean")).toBeVisible({ timeout: 5_000 })
  })

  test("invalid JSON keeps last good graph then recovers", async ({ page }) => {
    await openPath(page, harness.demoPath)
    await expect(page.getByTestId("ecp-step-echo")).toBeVisible()

    writeFileSync(harness.demoPath, "{ not json\n")
    await expect(page.getByTestId("load-error")).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("load-error")).toContainText("ECP_EXECUTION_LOAD")
    await expect(page.getByTestId("ecp-step-echo")).toBeVisible()

    writeFileSync(
      harness.demoPath,
      `${JSON.stringify(
        {
          schema: "@executioncontrolprotocol.execution",
          version: "2.0",
          execution: {
            id: "demo",
            label: "Demo recovered",
            accepts: {
              type: "object",
              properties: { message: { type: "string", default: "hello" } },
              required: ["message"],
            },
          },
          steps: [
            {
              id: "echo",
              uses: "@executioncontrolprotocol/test.echo",
              input: { value: { $ref: "state.message" } },
              as: "out",
            },
          ],
        },
        null,
        2,
      )}\n`,
    )
    await expect(page.getByTestId("load-error")).toHaveCount(0, { timeout: 5_000 })
    await expect(page.getByTestId("workspace-title")).toContainText("Demo recovered")
  })

  test("editing $script.path re-validates", async ({ page }) => {
    await openPath(page, harness.scriptPath)
    await page.getByTestId("tab-validation").click()
    await expect(page.getByTestId("validation-clean")).toBeVisible({ timeout: 10_000 })

    writeFileSync(harness.bannerPath, "const greeting = 'v2'\n")
    await expect
      .poll(async () => page.getByTestId("workspace").getAttribute("data-loads"), { timeout: 5_000 })
      .not.toBe("1")

    writeFileSync(harness.bannerPath, "const (\n")
    await expect(page.getByTestId("validation-issue").first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId("validation-issue").first()).toContainText("ECP_SCRIPT_INVALID")

    writeFileSync(harness.bannerPath, "const greeting = 'ok'\n")
    await expect(page.getByTestId("validation-clean")).toBeVisible({ timeout: 5_000 })
  })

  test("runs list replays statuses on the graph", async ({ page }) => {
    await openPath(page, harness.scriptPath)
    await page.getByTestId("tab-runs").click()
    await expect(page.getByTestId("runs-empty")).toBeVisible()
    await expect(page.getByTestId("ecp-step-scripted")).toHaveAttribute("data-status", "idle")

    await openPath(page, harness.demoPath)
    await page.getByTestId("tab-run").click()
    await page.getByTestId("ecp-run").click()
    await expect(page.getByTestId("ecp-step-echo")).toHaveAttribute("data-status", "completed", {
      timeout: 15_000,
    })

    await page.reload()
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId("ecp-step-echo")).toHaveAttribute("data-status", "idle", {
      timeout: 10_000,
    })

    await page.getByTestId("tab-runs").click()
    await page.getByTestId("run-history-item").first().click()
    await expect(page.getByTestId("ecp-step-echo")).toHaveAttribute("data-status", "completed", {
      timeout: 10_000,
    })
    await expect(page.getByTestId("run-replay")).toBeVisible()
    await expect(page.getByTestId("run-replay-step").first()).toBeVisible()

    await page.getByTestId("runs-clear-replay").click()
    await expect(page.getByTestId("ecp-step-echo")).toHaveAttribute("data-status", "idle", {
      timeout: 10_000,
    })
  })

  test("run updates live statuses and shows result; runs list replays", async ({ page }) => {
    await openPath(page, harness.demoPath)
    await page.getByTestId("tab-run").click()
    await page.getByTestId("ecp-run").click()
    await expect(page.getByTestId("run-status")).toHaveAttribute("data-status", /completed|running/, {
      timeout: 15_000,
    })
    await expect(page.getByTestId("run-result")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId("run-step").first()).toBeVisible()

    await page.getByTestId("tab-runs").click()
    await expect(page.getByTestId("run-history-item").first()).toBeVisible({ timeout: 10_000 })
    await page.getByTestId("run-history-item").first().click()
    await expect(page.getByTestId("run-replay")).toBeVisible()
    await expect(page.getByTestId("run-replay-step").first()).toBeVisible()
  })

  test("step ports show types from the capability's accepts schema", async ({ page }) => {
    // The capability list is light, so the App fetches full entries by id. Regression: every port
    // read `unknown` because the by-id response ({ item }) was read as a list ({ items }).
    await openPath(page, harness.typedPath)
    const step = page.getByTestId("ecp-step-bounded")
    await expect(step).toBeVisible()
    await expect(step).toContainText("text:string", { timeout: 10_000 })
    await expect(step).not.toContainText("text:unknown")
  })

  test("parallel execution shows one frame label without edge clipping", async ({ page }) => {
    await openPath(page, harness.parallelPath)
    // One frame for the whole parallel, not one per line.
    await expect(page.locator('[data-testid^="ecp-frame-label-prepare"]')).toHaveCount(1)
    const label = page.getByTestId("ecp-frame-label-prepare")
    await expect(label).toBeVisible()
    await expect(label).toHaveText("Prepare both sides in parallel for the pipeline")
    const labelBox = await label.boundingBox()
    expect(labelBox).not.toBeNull()
    expect(labelBox!.width).toBeGreaterThan(200)
    await expect(page.locator(".ecp-rf-edge-label", { hasText: "Prepare both sides" })).toHaveCount(0)
  })

  test("graph fits the canvas on open; selection does not move the viewport", async ({ page }) => {
    await openPath(page, harness.demoPath)
    await expect(page.getByTestId("ecp-step-echo")).toBeVisible()
    const canvas = page.getByTestId("graph-canvas")
  const step = page.getByTestId("ecp-step-echo")
    await expect
      .poll(async () => (await step.boundingBox())?.width ?? 0, { timeout: 5_000 })
      .toBeGreaterThan(100)
    const stepBox = await step.boundingBox()
    const canvasBox = await canvas.boundingBox()
    expect(stepBox).not.toBeNull()
    expect(canvasBox).not.toBeNull()
    expect(stepBox!.x).toBeGreaterThanOrEqual(canvasBox!.x - 2)
    expect(stepBox!.y).toBeGreaterThanOrEqual(canvasBox!.y - 2)

    const viewportBefore = await page.locator(".react-flow__viewport").getAttribute("style")
    await step.click()
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-selected-node", "echo")
    const viewportAfter = await page.locator(".react-flow__viewport").getAttribute("style")
    expect(viewportAfter).toBe(viewportBefore)
  })

  test("wider execution refits the viewport", async ({ page }) => {
    await openPath(page, harness.demoPath)
    await expect
      .poll(async () => (await page.getByTestId("ecp-step-echo").boundingBox())?.width ?? 0, { timeout: 5_000 })
      .toBeGreaterThan(100)
    const narrowZoom = await page.evaluate(() => {
      const el = document.querySelector(".react-flow__viewport") as HTMLElement | null
      return el?.style.transform ?? ""
    })
    await openPath(page, harness.parallelPath)
    await expect(page.getByTestId("ecp-step-left")).toBeVisible()
    await expect
      .poll(async () => (await page.getByTestId("ecp-step-left").boundingBox())?.width ?? 0, { timeout: 5_000 })
      .toBeGreaterThan(100)
    const wideZoom = await page.evaluate(() => {
      const el = document.querySelector(".react-flow__viewport") as HTMLElement | null
      return el?.style.transform ?? ""
    })
    expect(wideZoom).not.toBe("")
    expect(wideZoom).not.toBe(narrowZoom)
  })

  test("open by id", async ({ page }) => {
    const put = await harness.host.operations.commit({
      type: "execution",
      action: "create",
      object: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { id: "saved-demo", label: "Saved" },
        steps: [
          {
            id: "echo",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "saved" },
            as: "out",
          },
        ],
      },
    })
    expect(put.ok).toBe(true)

    await page.goto(appUrl(harness.baseUrl, harness.token, { id: "saved-demo", dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId("workspace-title")).toContainText("Saved")
  })
})
