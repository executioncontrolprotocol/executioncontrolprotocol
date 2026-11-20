import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type {
  CapabilityEntry,
  PluginManifest,
  PluginSchemaDocument,
} from "@executioncontrolprotocol/protocol"
import { HostSchemaSet, validateExecution } from "../src/index.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function walkEcpFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walkEcpFiles(full, out)
    else if (name.endsWith(".ecp.json")) out.push(full)
  }
  return out
}

function loadCapabilities(): {
  capabilities: CapabilityEntry[]
  loadPluginSchema: (pluginId: string) => Promise<PluginSchemaDocument | undefined>
  schemaFingerprints: Array<{ pluginId: string; version: string; hash: string }>
} {
  const manifests = ["plugins", "fixtures/plugins"]
    .flatMap((dir) => readdirSync(path.join(root, dir)).map((name) => path.join(root, dir, name, "ecp.manifest.json")))
    .filter((file) => {
      try {
        return statSync(file).isFile()
      } catch {
        return false
      }
    })
  const capabilities: CapabilityEntry[] = []
  const schemasByPlugin = new Map<string, PluginSchemaDocument>()
  const schemaFingerprints: Array<{ pluginId: string; version: string; hash: string }> = []
  for (const file of manifests) {
    const manifest = JSON.parse(readFileSync(file, "utf8")) as PluginManifest
    const schemaPath = path.join(path.dirname(file), manifest.pluginSchema?.path ?? "ecp.schema.json")
    const schemaDocument = JSON.parse(readFileSync(schemaPath, "utf8")) as PluginSchemaDocument
    schemasByPlugin.set(manifest.plugin.id, schemaDocument)
    schemasByPlugin.set(manifest.plugin.package, schemaDocument)
    schemaFingerprints.push({
      pluginId: manifest.plugin.id,
      version: manifest.plugin.version,
      hash: manifest.pluginSchema.hash,
    })
    for (const capability of manifest.capabilities) {
      capabilities.push({
        id: capability.id,
        plugin: manifest.plugin.id,
        package: manifest.plugin.package,
        pluginVersion: manifest.plugin.version,
        summary: capability.summary,
        description: capability.description,
        useCases: capability.useCases,
        projections: capability.projections,
        timeoutMs: capability.timeoutMs,
        ...(capability.contract ? { contract: capability.contract } : {}),
        ...(capability.code ? { code: capability.code } : {}),
      })
    }
  }
  return {
    capabilities,
    schemaFingerprints,
    loadPluginSchema: async (pluginId) => schemasByPlugin.get(pluginId),
  }
}

function countSteps(nodes: unknown[] | undefined): number {
  let total = 0
  for (const node of nodes ?? []) {
    if (!node || typeof node !== "object" || Array.isArray(node)) continue
    const record = node as Record<string, unknown>
    const type = typeof record.type === "string" ? record.type : "step"
    if (type === "step" && typeof record.uses === "string") total += 1
    if (Array.isArray(record.steps)) total += countSteps(record.steps)
    if (Array.isArray(record.branches)) {
      for (const branch of record.branches) {
        if (Array.isArray(branch)) total += countSteps(branch)
        else if (branch && typeof branch === "object" && Array.isArray((branch as { steps?: unknown[] }).steps)) {
          total += countSteps((branch as { steps: unknown[] }).steps)
        }
      }
    }
  }
  return total
}

describe("scale path regression", () => {
  it("validates every fixture and example execution without boolean-schema noise", async () => {
    const { capabilities, loadPluginSchema, schemaFingerprints } = loadCapabilities()
    const schemaSet = await HostSchemaSet.create(capabilities, { loadPluginSchema, schemaFingerprints })
    const files = [...walkEcpFiles(path.join(root, "fixtures")), ...walkEcpFiles(path.join(root, "examples"))]
    let steps = 0
    let compared = 0
    for (const file of files) {
      let manifest: unknown
      try {
        manifest = JSON.parse(readFileSync(file, "utf8")) as unknown
      } catch {
        continue
      }
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) continue
      const record = manifest as { steps?: unknown[] }
      steps += countSteps(record.steps)
      const result = await validateExecution(manifest, {
        capabilities,
        loadPluginSchema,
        schemaFingerprints,
        schemaSet,
        executionDir: path.dirname(file),
        readText: async (absolutePath: string) => readFileSync(absolutePath, "utf8"),
      })
      for (const issue of result.issues) {
        expect(issue.message, path.relative(root, file)).not.toMatch(/boolean schema is false/i)
      }
      const raw = result.issues.map((issue) => `${issue.code}|${issue.path}|${issue.message}|${issue.severity}`)
      expect(new Set(raw).size, `F2 uniqueness ${path.relative(root, file)}`).toBe(raw.length)
      compared += 1
    }
    expect(steps).toBeGreaterThanOrEqual(96)
    expect(compared).toBeGreaterThan(0)
  }, 120_000)

  it("still reports structural errors next to a $secret or $env", async () => {
    const { capabilities, loadPluginSchema, schemaFingerprints } = loadCapabilities()
    const manifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      bogusRoot: true,
      steps: [
        {
          id: "echo",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $env: "PATH" } },
          as: "echo",
          bogusStep: 1,
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities, loadPluginSchema, schemaFingerprints })
    const seen = JSON.stringify(result.issues, null, 1)
    expect(result.issues.map((issue) => issue.path), seen).toContain("/steps/0/input/value")
    expect(JSON.stringify(result.issues), seen).toContain("bogusStep")
    expect(JSON.stringify(result.issues), seen).toContain("bogusRoot")
    expect(JSON.stringify(result.issues), seen).not.toMatch(/boolean schema is false/i)
  }, 30_000)

  it("reports a real input error on the object that holds a nested $env, without type-union noise", async () => {
    const { capabilities, loadPluginSchema, schemaFingerprints } = loadCapabilities()
    const manifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          // bounded requires `text`; the only property given wraps an $env two levels down.
          id: "bounded",
          uses: "@executioncontrolprotocol/test.bounded",
          input: { extra: { inner: { $env: "PATH" } } },
          as: "bounded",
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities, loadPluginSchema, schemaFingerprints })
    const seen = JSON.stringify(result.issues, null, 1)
    const paths = result.issues.map((issue) => `${issue.code} ${issue.path}`)
    expect(paths, seen).toContain("ECP_INPUT_INVALID /steps/0/input/text") // required `text` missing
    expect(paths, seen).toContain("ECP_INPUT_INVALID /steps/0/input/extra") // unknown property
    expect(paths, seen).toContain("ECP_MANIFEST_INVALID /steps/0/input/extra/inner")
    // No "must be null / boolean / number ..." cascade onto the marker's ancestors.
    expect(result.issues.filter((issue) => /must be (null|boolean|number|array)/.test(issue.message)), seen).toEqual([])
  }, 30_000)

  it("validates the localize-banner reference example against the real plugins", async () => {
    // Real Firefly, Anthropic and test plugin schemas; only the Anthropic config is absent.
    const { capabilities, loadPluginSchema, schemaFingerprints } = loadCapabilities()
    const file = path.join(root, "fixtures/manifests/valid/localize-banner.ecp.json")
    const manifest = JSON.parse(readFileSync(file, "utf8")) as unknown
    const result = await validateExecution(manifest, {
      capabilities: capabilities.filter((capability) => !capability.plugin.includes("fixture")),
      loadPluginSchema,
      schemaFingerprints,
      executionDir: path.dirname(file),
      readText: async (absolutePath: string) => readFileSync(absolutePath, "utf8"),
    })
    const seen = JSON.stringify(result.issues, null, 1)
    expect(result.issues.map((issue) => `${issue.code} ${issue.path}`), seen).toEqual([
      "ECP_CONFIG_UNKNOWN /steps/2/config",
    ])
  }, 30_000)

  it("reuses compiled validators on a shared HostSchemaSet and invalidates on fingerprint change", async () => {
    const { capabilities, loadPluginSchema, schemaFingerprints } = loadCapabilities()
    const first = await HostSchemaSet.create(capabilities, { loadPluginSchema, schemaFingerprints })
    const echo = capabilities.find((capability) => capability.id.endsWith(".echo"))
    expect(echo).toBeTruthy()
    const manifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "echo", uses: echo!.id, input: { value: "hi" }, as: "echo" }],
    }
    await validateExecution(manifest, { capabilities, loadPluginSchema, schemaFingerprints, schemaSet: first })
    const afterFirst = first.inputCompileCount
    await validateExecution(manifest, { capabilities, loadPluginSchema, schemaFingerprints, schemaSet: first })
    expect(first.inputCompileCount).toBe(afterFirst)
    expect(first.documentCompileCount).toBe(1)

    const bumped = schemaFingerprints.map((item, index) =>
      index === 0 ? { ...item, hash: `${item.hash.slice(0, 63)}f` } : item,
    )
    const second = await HostSchemaSet.create(capabilities, {
      loadPluginSchema,
      schemaFingerprints: bumped,
    })
    expect(second.schemaHash).not.toBe(first.schemaHash)
  }, 30_000)
})
