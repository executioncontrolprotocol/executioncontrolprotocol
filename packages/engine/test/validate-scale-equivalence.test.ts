import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type {
  CapabilityEntry,
  PluginManifest,
  PluginSchemaDocument,
} from "@executioncontrolprotocol/protocol"
import { HostSchemaSet, validateExecution, validateExecutionNext } from "../src/index.js"

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
  schemasByPlugin: Map<string, PluginSchemaDocument>
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
  for (const file of manifests) {
    const manifest = JSON.parse(readFileSync(file, "utf8")) as PluginManifest
    const schemaPath = path.join(path.dirname(file), manifest.pluginSchema?.path ?? "ecp.schema.json")
    const schemaDocument = JSON.parse(readFileSync(schemaPath, "utf8")) as PluginSchemaDocument
    schemasByPlugin.set(manifest.plugin.id, schemaDocument)
    schemasByPlugin.set(manifest.plugin.package, schemaDocument)
    const configSchema = schemaDocument.$defs.config
    for (const capability of manifest.capabilities) {
      const accepts = schemaDocument.$defs[`${capability.name}.accepts`]
      const returns = schemaDocument.$defs[`${capability.name}.returns`]
      if (!accepts || !returns) continue
      capabilities.push({
        id: capability.id,
        plugin: manifest.plugin.id,
        package: manifest.plugin.package,
        pluginVersion: manifest.plugin.version,
        summary: capability.summary,
        description: capability.description,
        useCases: capability.useCases,
        projections: capability.projections,
        accepts,
        returns,
        configSchema,
        timeoutMs: capability.timeoutMs,
      })
    }
  }
  return {
    capabilities,
    schemasByPlugin,
    loadPluginSchema: async (pluginId) => schemasByPlugin.get(pluginId),
  }
}

function project(issues: Array<{ code: string; path: string; severity: string }>): string[] {
  const unique = [
    ...new Set(issues.map((issue) => `${issue.code}|${issue.path}|${issue.severity}`)),
  ]
  return unique.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
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

describe("scale path equivalence", () => {
  it("matches legacy {code,path,severity} for every fixture and example execution", async () => {
    const { capabilities, loadPluginSchema } = loadCapabilities()
    const legacySchemas = await HostSchemaSet.create(capabilities)
    const scaleSchemas = await HostSchemaSet.createBase(capabilities, loadPluginSchema)
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
      const shared = {
        capabilities,
        loadPluginSchema,
        executionDir: path.dirname(file),
        readText: async (absolutePath: string) => readFileSync(absolutePath, "utf8"),
      }
      const legacy = await validateExecution(manifest, { ...shared, schemaSet: legacySchemas })
      const next = await validateExecutionNext(manifest, { ...shared, schemaSet: scaleSchemas })
      expect(next.valid, path.relative(root, file)).toBe(legacy.valid)
      const left = project(legacy.issues)
      const right = project(next.issues)
      expect(right, path.relative(root, file)).toEqual(left)
      const rawNext = next.issues.map((issue) => `${issue.code}|${issue.path}|${issue.severity}`)
      expect(new Set(rawNext).size, `F2 uniqueness ${path.relative(root, file)}`).toBe(rawNext.length)
      compared += 1
    }
    expect(steps).toBeGreaterThanOrEqual(96)
    expect(compared).toBeGreaterThan(0)
  }, 120_000)

  it("still reports structural errors next to a $secret or $env", async () => {
    const { capabilities, loadPluginSchema } = loadCapabilities()
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
    const options = { capabilities, loadPluginSchema }
    const legacy = await validateExecution(manifest, options)
    const next = await validateExecutionNext(manifest, options)
    const seen = JSON.stringify({ legacy: legacy.issues, next: next.issues }, null, 1)
    expect(next.issues.map((issue) => issue.path), seen).toContain("/steps/0/input/value")
    expect(JSON.stringify(next.issues), seen).toContain("bogusStep")
    expect(JSON.stringify(next.issues), seen).toContain("bogusRoot")
  }, 30_000)
})
