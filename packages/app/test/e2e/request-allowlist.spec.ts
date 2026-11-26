import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page, type Request } from "@playwright/test"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const branchLoopSource = path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json")

const ALLOWED = new Set([
  "POST /v1/retrieve",
  "POST /v1/execute",
  "POST /v1/commit",
  "GET /v1/watch",
])

function isAllowedArtifact(pathname: string, method: string): boolean {
  return method === "GET" && /^\/v1\/runs\/[^/]+\/artifacts\/[^/]+$/.test(pathname)
}

function recordOf(request: Request): { key: string; body?: string } {
  const url = new URL(request.url())
  if (!url.pathname.startsWith("/v1/")) return { key: "" }
  const key = `${request.method()} ${url.pathname}`
  return { key, body: request.postData() ?? undefined }
}

test.describe("App host API allowlist", () => {
  let harness: AppE2eHarness

  test.beforeAll(async () => {
    harness = await startAppHarness()
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  test("only operations, watch, and artifacts hit /v1/", async ({ page }) => {
    const seen: Array<{ key: string; body?: string }> = []
    page.on("request", (request) => {
      const row = recordOf(request)
      if (row.key) seen.push(row)
    })

    await page.goto(appUrl(harness.baseUrl, harness.token, { dir: harness.workDir, open: harness.demoPath }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 20_000 })

    const put = await harness.host.operations.commit({
      type: "execution",
      action: "create",
      object: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { id: "allowlist-id", label: "Allowlist" },
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

    await page.goto(appUrl(harness.baseUrl, harness.token, { id: "allowlist-id", dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 20_000 })

    await page.goto(appUrl(harness.baseUrl, harness.token, { open: harness.demoPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await page.getByTestId("ecp-step-echo").click({ button: "right" })
    await page.getByTestId("canvas-menu-item-wrap").click()
    await page.getByTestId("canvas-menu-item-wrap-if").click()
    await expect(page.locator('[data-testid^="ecp-frame-if-"]')).toBeVisible({ timeout: 15_000 })

    const branchLoopPath = path.join(harness.workDir, "allowlist-branch-loop.ecp.json")
    copyFileSync(branchLoopSource, branchLoopPath)
    await openPath(page, harness, branchLoopPath)
    await page.getByTestId("ecp-loop-retry").click()
    const field = page.getByTestId("loop-field-as")
    await expect(field).toBeVisible({ timeout: 10_000 })
    const unique = `item_${Date.now() % 10_000}`
    await field.fill(unique)
    await field.blur()
    await expect.poll(() => readFileSync(branchLoopPath, "utf8").includes(`"as": "${unique}"`), { timeout: 15_000 }).toBe(true)

    const transformDir = mkdtempSync(path.join(os.tmpdir(), "ecp-allowlist-transform-"))
    const transformScript = path.join(transformDir, "step.js")
    writeFileSync(transformScript, "export default (v) => v\n")
    const transformExec = path.join(transformDir, "transform.ecp.json")
    writeFileSync(
      transformExec,
      `${JSON.stringify(
        {
          schema: "@executioncontrolprotocol.execution",
          version: "2.0",
          execution: { label: "Transform script" },
          steps: [
            {
              id: "map",
              uses: "@executioncontrolprotocol/core.transform",
              script: { path: "step.js", lang: "js" },
              input: { value: { $ref: "state.message" } },
              as: "map",
            },
          ],
        },
        null,
        2,
      )}\n`,
    )
    await openPath(page, harness, transformExec)
    await page.getByTestId("ecp-step-map").click()
    await expect(page.getByTestId("node-script-editor")).toBeVisible({ timeout: 15_000 })
    await page.getByTestId("node-script-editor").fill("export default (v) => ({ ...v, ok: true })\n")
    await page.getByTestId("node-script-editor").blur()
    await expect
      .poll(() => readFileSync(path.join(transformDir, "step.js"), "utf8").includes("ok: true"), { timeout: 15_000 })
      .toBe(true)

    await page.goto(appUrl(harness.baseUrl, harness.token, { open: harness.demoPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
    await page.getByTestId("tab-run").click()
    await page.getByTestId("ecp-run").click()
    await page.getByTestId("tab-runs").click()
    await expect(page.getByTestId("run-history-item").first()).toBeVisible({ timeout: 15_000 })

    for (const row of seen) {
      const match = /^(GET|POST) (\/v1\/.+)$/.exec(row.key)
      if (!match) continue
      const method = match[1]!
      const pathname = match[2]!
      const ok = ALLOWED.has(row.key) || isAllowedArtifact(pathname, method)
      expect(ok, row.key).toBe(true)
    }

    const keys = seen.map((row) => row.key)
    expect(keys.some((k) => k === "POST /v1/retrieve")).toBe(true)
    expect(keys.some((k) => k === "POST /v1/execute")).toBe(true)
    expect(keys.filter((k) => k === "POST /v1/commit").length).toBeGreaterThan(0)
    expect(keys.some((k) => k === "GET /v1/watch")).toBe(true)
    const commitBodies = seen
      .filter((row) => row.key === "POST /v1/commit")
      .map((row) => row.body ?? "")
    expect(commitBodies.some((body) => body.includes('"draft":true'))).toBe(true)
    expect(commitBodies.some((body) => body.includes('"scripts"'))).toBe(true)
  })
})

async function openPath(page: Page, harness: AppE2eHarness, filePath: string): Promise<void> {
  await page.goto(appUrl(harness.baseUrl, harness.token, { open: filePath, dir: path.dirname(filePath) }))
  await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-version", /.+/, { timeout: 20_000 })
}