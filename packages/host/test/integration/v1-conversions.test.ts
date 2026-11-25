import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createLocalHost, type LocalHost } from "../../src/index.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../")
const v1Dir = path.join(repoRoot, "fixtures/v1")
const pluginTestRoot = path.join(repoRoot, "plugins/plugin-test")
const pluginAnthropicRoot = path.join(repoRoot, "plugins/plugin-anthropic")
const pluginAzureRoot = path.join(repoRoot, "plugins/plugin-azure-blob-storage")

vi.mock("../../../../plugins/plugin-azure-blob-storage/dist/azure-client.js", () => ({
  uploadBytes: vi.fn(async (_config: unknown, options: { container: string; blobName: string }) => ({
    blobUrl: `https://example.blob.core.windows.net/${options.container}/${options.blobName}`,
  })),
  createSas: vi.fn(async (_config: unknown, options: { container: string; blobName: string }) => ({
    sasUrl: `https://example.blob.core.windows.net/${options.container}/${options.blobName}?sas=1`,
    expiresOn: new Date(Date.now() + 3600_000).toISOString(),
  })),
  downloadBytes: vi.fn(async () => ({
    bytes: new Uint8Array([137, 80, 78, 71]),
    contentType: "image/png",
  })),
  createServiceClient: vi.fn(),
}))

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

interface ExpectedRun {
  input?: Record<string, unknown>
  status: string
  result?: Record<string, unknown>
  steps?: Array<{ nodeId: string; status: string }>
}

describe("v1 fixture conversions", () => {
  let host: LocalHost | undefined
  let home: string
  let work: string
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "ecp-v1-"))
    work = path.join(home, "work")
    mkdirSync(work, { recursive: true })
    writeFileSync(path.join(work, "fixture.png"), TINY_PNG)

    fetchMock = vi.fn(async () =>
      Response.json({
        content: [{ type: "text", text: "brief" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    host = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot, pluginAnthropicRoot, pluginAzureRoot],
    })

    const anthropicConfig = await host.operations.commit({
      type: "config",
      action: "create",
      object: {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "anthropic/default",
        plugin: "@executioncontrolprotocol/anthropic",
        values: { apiKey: "test-key", model: "claude-sonnet-4-5" },
        objectVersion: 0,
        updatedAt: "",
      },
    })
    expect(anthropicConfig.ok).toBe(true)
    const azureConfig = await host.operations.commit({
      type: "config",
      action: "create",
      object: {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "azure-blob-storage/default",
        plugin: "@executioncontrolprotocol/azure-blob-storage",
        values: {
          connectionString:
            "DefaultEndpointsProtocol=https;AccountName=example;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net",
          defaultContainer: "ecp",
        },
        objectVersion: 0,
        updatedAt: "",
      },
    })
    expect(azureConfig.ok).toBe(true)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (host) await host.stop()
    host = undefined
  })

  const names = readdirSync(v1Dir)
    .filter((name) => name.endsWith(".ecp.json"))
    .sort()

  for (const name of names) {
    it(`runs ${name}`, async () => {
      const expectedPath = path.join(v1Dir, name.replace(/\.ecp\.json$/, ".run.json"))
      const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as ExpectedRun
      let text = readFileSync(path.join(v1Dir, name), "utf8")
      text = text
        .replaceAll("__FIXTURE_PNG__", path.join(work, "fixture.png").replaceAll("\\", "\\\\"))
        .replaceAll("__MISSING_PNG__", path.join(work, "missing.png").replaceAll("\\", "\\\\"))
      const execPath = path.join(work, name)
      writeFileSync(execPath, text)

      if (name.includes("caption")) {
        fetchMock.mockResolvedValueOnce(
          Response.json({
            content: [{ type: "text", text: "A small widget." }],
            usage: { input_tokens: 8, output_tokens: 4 },
          }),
        )
      }

      const result = await host!.operations.execute({
        execution: { path: execPath },
        input: expected.input ?? {},
        wait: true,
      })

      if (expected.status === "failed") {
        expect(result.ok === false || (result.ok && "status" in result.data && result.data.status === "failed")).toBe(
          true,
        )
        return
      }

      expect(result.ok, JSON.stringify(result)).toBe(true)
      if (!result.ok || !("status" in result.data)) return
      expect(result.data.status).toBe(expected.status)
      if (expected.result) {
        expect(result.data.result).toMatchObject(expected.result)
      }
      if (expected.steps) {
        const steps = result.data.steps ?? []
        for (const want of expected.steps) {
          expect(steps.some((step) => step.nodeId === want.nodeId && step.status === want.status)).toBe(true)
        }
      }
    }, 30_000)
  }
})
