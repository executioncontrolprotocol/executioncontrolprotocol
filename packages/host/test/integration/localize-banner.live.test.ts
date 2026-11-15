import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { createLocalHost, type LocalHost } from "../../src/index.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../")
const exampleDir = path.join(repoRoot, "examples/localize-banner")
const fixturePsd = path.join(exampleDir, "fixtures/banner-with-text.psd")
const pluginAnthropicRoot = path.join(repoRoot, "plugins/plugin-anthropic")
const pluginFireflyRoot = path.join(repoRoot, "plugins/plugin-adobe-firefly-services")
const pluginAzureRoot = path.join(repoRoot, "plugins/plugin-azure-blob-storage")

const clientId = process.env.ECP_SECRET_ADOBE_FIREFLY_CLIENT_ID
const clientSecret = process.env.ECP_SECRET_ADOBE_FIREFLY_CLIENT_SECRET
const scopes = process.env.ECP_SECRET_ADOBE_FIREFLY_SCOPES
const anthropicKey = process.env.ECP_SECRET_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY
const azureConnectionString =
  process.env.ECP_SECRET_AZURE_BLOB_STORAGE_CONNECTION_STRING ?? process.env.AZURE_STORAGE_CONNECTION_STRING
const sourceImageUrlEnv = process.env.ECP_LIVE_LOCALIZE_SOURCE_URL
const outputUrlEnv = process.env.ECP_LIVE_LOCALIZE_OUTPUT_URL

const live = process.env.ECP_LIVE_A10 === "1"
/** Prefer explicit env credentials; otherwise use OS keychain `$secret` refs (local dogfood). */
const keychainMode = !clientId || !clientSecret || !anthropicKey
const hasUrlEnv = Boolean(sourceImageUrlEnv && outputUrlEnv)
const hasAzure = Boolean(azureConnectionString) || keychainMode
const ready = Boolean(live && (hasUrlEnv || hasAzure) && (keychainMode || (clientId && clientSecret && anthropicKey)))

/**
 * Default text layers in `examples/localize-banner/fixtures/banner-with-text.psd`.
 */
const fixtureTexts = {
  Headline: "Summer sale",
  Subhead: "Limited time offer",
} as const

const SOURCE_BLOB = "localize-banner/banner-with-text.psd"
const OUTPUT_BLOB = "localize-banner/banner-out.png"
/** Create + write — Adobe PUT needs write; create covers a new blob name. */
const OUTPUT_SAS_PERMISSIONS = "cw"
const SAS_TTL_SECONDS = 86_400

/**
 * A10 — live localize-banner against real Firefly + Anthropic + Azure.
 * Skips cleanly when `ECP_LIVE_A10` is unset (default CI).
 *
 * Provisioning:
 * - If `ECP_LIVE_LOCALIZE_SOURCE_URL` / `ECP_LIVE_LOCALIZE_OUTPUT_URL` are set, use them.
 * - Otherwise upload `fixtures/banner-with-text.psd` via `azure-blob-storage` and mint
 *   read + create/write SAS URLs (needs the Azure config / connection-string secret).
 */
describe.skipIf(!ready)("localize-banner (live A10)", () => {
  let host: LocalHost | undefined
  let home: string

  afterEach(async () => {
    if (host) await host.stop()
    host = undefined
  })

  it(
    "uploads the fixture PSD when needed, then runs localize-banner end to end",
    async () => {
      home = await mkdtemp(path.join(os.tmpdir(), "ecp-a10-"))
      const work = path.join(home, "work")
      mkdirSync(work, { recursive: true })

      host = await createLocalHost({
        home,
        mode: "in-process",
        extraPlugins: [pluginAnthropicRoot, pluginFireflyRoot, pluginAzureRoot],
      })

      await commitProviderConfigs(host)

      const execPath = path.join(work, "localize-banner.ecp.json")
      writeFileSync(execPath, readFileSync(path.join(exampleDir, "localize-banner.ecp.json"), "utf8"))
      mkdirSync(path.join(work, "scripts"), { recursive: true })
      writeFileSync(
        path.join(work, "scripts/relabel-text-layers.uxp.js"),
        readFileSync(path.join(exampleDir, "scripts/relabel-text-layers.uxp.js"), "utf8"),
      )

      const { sourceImageUrl, outputUrl, provisioned } = await resolveUrls(host, work)

      const input = {
        locale: "es",
        texts: { ...fixtureTexts },
        sourceImageUrl,
        outputUrl,
      }

      const validated = await host.operations.execute({
        execution: { path: execPath },
        mode: "validate",
        input,
      })
      expect(validated.ok, JSON.stringify(validated)).toBe(true)

      const ran = await host.operations.execute({
        execution: { path: execPath },
        input,
        wait: true,
      })
      expect(ran.ok, JSON.stringify(ran)).toBe(true)
      if (!ran.ok || !("status" in ran.data)) return
      expect(ran.data.status).toBe("completed")
      expect(ran.data.result).toMatchObject({
        translation: expect.objectContaining({ text: expect.any(String) }),
        banner: expect.objectContaining({ outputs: expect.any(Array) }),
      })
      const texts = parseTranslatedTexts(String((ran.data.result.translation as { text?: string }).text ?? ""))
      expect(texts.Headline).toEqual(expect.any(String))
      expect(texts.Headline).not.toBe(fixtureTexts.Headline)
      expect(texts.Subhead).toEqual(expect.any(String))
      expect(texts.Subhead).not.toBe(fixtureTexts.Subhead)

      const evidenceDir = path.join(repoRoot, "realignment/evidence")
      mkdirSync(evidenceDir, { recursive: true })
      writeFileSync(
        path.join(evidenceDir, "a10-localize-banner.json"),
        `${JSON.stringify(
          {
            runId: ran.data.runId,
            status: ran.data.status,
            result: redactUrls(ran.data.result),
            steps: ran.data.steps,
            provisioned,
            sourceBlob: SOURCE_BLOB,
            outputBlob: OUTPUT_BLOB,
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

async function commitProviderConfigs(host: LocalHost): Promise<void> {
  await host.operations.commit({
    type: "config",
    action: "create",
    object: {
      schema: "@executioncontrolprotocol.config",
      version: "1.0",
      id: "anthropic/default",
      plugin: "@executioncontrolprotocol/anthropic",
      values: keychainMode
        ? { apiKey: { $secret: "anthropic/api-key" }, model: "claude-sonnet-4-5" }
        : { apiKey: anthropicKey, model: "claude-sonnet-4-5" },
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
      values: keychainMode
        ? {
            clientId: { $secret: "adobe-firefly-services/client-id" },
            clientSecret: { $secret: "adobe-firefly-services/client-secret" },
            ...(scopes ? { scopes } : {}),
          }
        : {
            clientId,
            clientSecret,
            ...(scopes ? { scopes } : {}),
          },
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
      id: "azure-blob-storage/default",
      plugin: "@executioncontrolprotocol/azure-blob-storage",
      values: azureConnectionString
        ? { connectionString: azureConnectionString, defaultContainer: "ecp-test" }
        : {
            connectionString: { $secret: "azure-blob-storage/connection-string" },
            defaultContainer: "ecp-test",
          },
      objectVersion: 0,
      updatedAt: "",
    },
  })
}

async function resolveUrls(
  host: LocalHost,
  work: string,
): Promise<{ sourceImageUrl: string; outputUrl: string; provisioned: boolean }> {
  if (sourceImageUrlEnv && outputUrlEnv) {
    return { sourceImageUrl: sourceImageUrlEnv, outputUrl: outputUrlEnv, provisioned: false }
  }

  const uploadPath = path.join(work, "a10-provision-azure.ecp.json")
  writeFileSync(
    uploadPath,
    `${JSON.stringify(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { id: "a10-provision-azure" },
        steps: [
          {
            id: "upload",
            uses: "@executioncontrolprotocol/azure-blob-storage.upload",
            config: "azure-blob-storage/default",
            input: {
              file: {
                kind: "file",
                path: fixturePsd,
                mediaType: "image/vnd.adobe.photoshop",
              },
              blobName: SOURCE_BLOB,
              createReadSas: true,
              contentType: "image/vnd.adobe.photoshop",
            },
            as: "uploaded",
          },
          {
            id: "source",
            uses: "@executioncontrolprotocol/azure-blob-storage.sas",
            config: "azure-blob-storage/default",
            input: {
              blobName: SOURCE_BLOB,
              permissions: "r",
              expiresInSeconds: SAS_TTL_SECONDS,
            },
            as: "source",
          },
          {
            id: "output",
            uses: "@executioncontrolprotocol/azure-blob-storage.sas",
            config: "azure-blob-storage/default",
            input: {
              blobName: OUTPUT_BLOB,
              permissions: OUTPUT_SAS_PERMISSIONS,
              expiresInSeconds: SAS_TTL_SECONDS,
            },
            as: "output",
          },
        ],
      },
      null,
      2,
    )}\n`,
  )

  const provisioned = await host.operations.execute({
    execution: { path: uploadPath },
    wait: true,
  })
  expect(provisioned.ok, JSON.stringify(provisioned)).toBe(true)
  if (!provisioned.ok || !("status" in provisioned.data)) {
    throw new Error("Azure provision execute returned an unexpected shape.")
  }
  expect(provisioned.data.status).toBe("completed")
  const result = provisioned.data.result as {
    source?: { sasUrl?: string }
    output?: { sasUrl?: string }
  }
  const sourceImageUrl = result.source?.sasUrl
  const outputUrl = result.output?.sasUrl
  expect(sourceImageUrl, JSON.stringify(result)).toEqual(expect.any(String))
  expect(outputUrl, JSON.stringify(result)).toEqual(expect.any(String))
  return { sourceImageUrl: sourceImageUrl!, outputUrl: outputUrl!, provisioned: true }
}

function parseTranslatedTexts(raw: string): Record<string, string> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = ((fenced && fenced[1]) || raw).trim()
  const parsed = JSON.parse(candidate || "{}") as { texts?: Record<string, string> }
  return parsed.texts && typeof parsed.texts === "object" ? parsed.texts : {}
}

function redactUrls(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      const url = new URL(value)
      if (url.search) return `${url.origin}${url.pathname}?[redacted]`
      return value
    } catch {
      return value
    }
  }
  if (Array.isArray(value)) return value.map(redactUrls)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactUrls(child)]))
  }
  return value
}
