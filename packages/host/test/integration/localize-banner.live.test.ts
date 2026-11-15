import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { createLocalHost, type LocalHost } from "../../src/index.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../")
const exampleDir = path.join(repoRoot, "examples/localize-banner")
const pluginTestRoot = path.join(repoRoot, "plugins/plugin-test")
const pluginAnthropicRoot = path.join(repoRoot, "plugins/plugin-anthropic")
const pluginFireflyRoot = path.join(repoRoot, "plugins/plugin-adobe-firefly-services")

const clientId = process.env.ECP_SECRET_ADOBE_FIREFLY_CLIENT_ID
const clientSecret = process.env.ECP_SECRET_ADOBE_FIREFLY_CLIENT_SECRET
const scopes = process.env.ECP_SECRET_ADOBE_FIREFLY_SCOPES
const anthropicKey = process.env.ECP_SECRET_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY
const sourceImageUrl = process.env.ECP_LIVE_LOCALIZE_SOURCE_URL
const outputUrl = process.env.ECP_LIVE_LOCALIZE_OUTPUT_URL

const live = process.env.ECP_LIVE_A10 === "1"
const ready = Boolean(live && clientId && clientSecret && anthropicKey && sourceImageUrl && outputUrl)

/**
 * A10 — live localize-banner against real Firefly + Anthropic.
 * Skips cleanly when secrets or signed URLs are absent (default CI).
 */
describe.skipIf(!ready)("localize-banner (live A10)", () => {
  let host: LocalHost | undefined
  let home: string

  afterEach(async () => {
    if (host) await host.stop()
    host = undefined
  })

  it(
    "validates and runs examples/localize-banner against live providers",
    async () => {
      home = await mkdtemp(path.join(os.tmpdir(), "ecp-a10-"))
      const work = path.join(home, "work")
      mkdirSync(work, { recursive: true })

      host = await createLocalHost({
        home,
        mode: "in-process",
        extraPlugins: [pluginTestRoot, pluginAnthropicRoot, pluginFireflyRoot],
      })

      await host.operations.commit({
        type: "config",
        action: "create",
        object: {
          schema: "@executioncontrolprotocol.config",
          version: "1.0",
          id: "anthropic/default",
          plugin: "@executioncontrolprotocol/anthropic",
          values: { apiKey: anthropicKey, model: "claude-sonnet-4-5" },
          objectVersion: 0,
          updatedAt: "",
        },
      })
      await host.operations.commit({
        type: "config",
        action: "create",
        object: {
          schema: "@executioncontrolprotocol.config",
          version: "1.0",
          id: "adobe-firefly-services/default",
          plugin: "@executioncontrolprotocol/adobe-firefly-services",
          values: {
            clientId,
            clientSecret,
            ...(scopes ? { scopes } : {}),
          },
          objectVersion: 0,
          updatedAt: "",
        },
      })

      const execPath = path.join(work, "localize-banner.ecp.json")
      writeFileSync(execPath, readFileSync(path.join(exampleDir, "localize-banner.ecp.json"), "utf8"))
      mkdirSync(path.join(work, "scripts"), { recursive: true })
      writeFileSync(
        path.join(work, "scripts/relabel-headline.uxp.js"),
        readFileSync(path.join(exampleDir, "scripts/relabel-headline.uxp.js"), "utf8"),
      )

      const validated = await host.operations.execute({
        execution: { path: execPath },
        mode: "validate",
        input: {
          locale: "es",
          headline: "Summer sale",
          sourceImageUrl,
          outputUrl,
        },
      })
      expect(validated.ok, JSON.stringify(validated)).toBe(true)

      const ran = await host.operations.execute({
        execution: { path: execPath },
        input: {
          locale: "es",
          headline: "Summer sale",
          sourceImageUrl,
          outputUrl,
        },
        wait: true,
      })
      expect(ran.ok, JSON.stringify(ran)).toBe(true)
      if (!ran.ok || !("status" in ran.data)) return
      expect(ran.data.status).toBe("completed")
      expect(ran.data.result).toMatchObject({
        localized: expect.any(String),
        banner: expect.any(Object),
      })

      const evidenceDir = path.join(repoRoot, "realignment/evidence")
      mkdirSync(evidenceDir, { recursive: true })
      writeFileSync(
        path.join(evidenceDir, "a10-localize-banner.json"),
        `${JSON.stringify(
          {
            runId: ran.data.runId,
            status: ran.data.status,
            result: ran.data.result,
            steps: ran.data.steps,
            recordedAt: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
      )
    },
    600_000,
  )
})
