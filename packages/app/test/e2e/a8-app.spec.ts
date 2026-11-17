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
    await expect(files).toHaveCount(3)
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
