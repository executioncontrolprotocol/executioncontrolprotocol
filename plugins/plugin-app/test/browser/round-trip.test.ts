import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { chromium } from "playwright"
import { serveApp, type AppServeHandle } from "../../src/serve-app.js"
import { resolveAppWebRoot } from "../../src/web-root.js"
import { ECHO_SOURCE, testHost } from "../host.js"
import type { Ecp } from "@executioncontrolprotocol/core"

const TEST_TOKEN = "unit-test-token-unit-test-token-unit"
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")

/**
 * Node + Playwright against plugin-app. Lives under `test:browser` because
 * the Vitest in-browser project cannot start a Node HTTP server, and the
 * integration CI job does not install Chromium.
 * @category App
 */
describe("plugin-app Playwright round-trip", () => {
  let ecp: Ecp | undefined
  let handle: AppServeHandle | undefined
  let dir: string | undefined

  afterEach(async () => {
    await handle?.close()
    handle = undefined
    await ecp?.terminate()
    ecp = undefined
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  it("changes a step config in the graph and writes the file", async () => {
    const webRoot = resolveAppWebRoot()
    if (!existsSync(join(webRoot, "index.html"))) {
      throw new Error(
        `App bundle missing at ${webRoot}. Run pnpm run build so dist/web exists before Playwright.`
      )
    }
    const root = join(process.cwd(), ".ecp")
    await mkdir(root, { recursive: true })
    dir = await mkdtemp(join(root, "app-live-"))
    const filePath = join(dir, "workflow.ecp.ts")
    await writeFile(filePath, ECHO_SOURCE, "utf8")
    const ctx = await testHost()
    ecp = ctx.ecp
    handle = await serveApp({
      host: ctx.host,
      filePath,
      httpPort: 0,
      token: TEST_TOKEN,
      printListenUrl: false,
      open: false,
      webRoot,
    })

    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(handle.url, { waitUntil: "domcontentloaded" })
      const step = page.getByTestId("ecp-step-echo")
      await step.waitFor({ timeout: 15_000 })
      await step.evaluate((el) => (el as HTMLElement).click())
      const dialog = page.getByRole("dialog")
      await dialog.waitFor({ timeout: 10_000 })
      const input = page.getByTestId("step-config-value")
      await input.waitFor({ timeout: 10_000 })
      await input.fill("from-graph")
      await page.getByTestId("step-config-save").click()
      await expect.poll(async () => readFile(filePath, "utf8"), { timeout: 10_000 }).toMatch(/from-graph/)
    } finally {
      await browser.close()
    }
    expect(existsSync(join(repoRoot, "packages", "app"))).toBe(true)
  }, 45_000)
})
