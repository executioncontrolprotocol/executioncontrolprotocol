import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { CapabilityEntry, ConfigObject, PluginManifest } from "@executioncontrolprotocol/protocol"
import { validateExecution } from "../src/index.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const manifests = path.join(root, "fixtures", "manifests")

function capabilitiesOf(file: string): CapabilityEntry[] {
  const manifest = JSON.parse(readFileSync(file, "utf8")) as PluginManifest
  return manifest.capabilities.map((capability) => ({
    id: capability.id,
    plugin: manifest.plugin.id,
    package: manifest.plugin.package,
    pluginVersion: manifest.plugin.version,
    summary: capability.summary,
    description: capability.description,
    useCases: capability.useCases,
    projections: capability.projections,
    accepts: capability.accepts,
    returns: capability.returns,
    configSchema: manifest.configSchema,
    timeoutMs: capability.timeoutMs,
  }))
}

const testCapabilities = capabilitiesOf(path.join(root, "fixtures/plugins/fixture-plugin/ecp.manifest.json"))
const creativeCapabilities = capabilitiesOf(path.join(root, "fixtures/plugins/fixture-creative/ecp.manifest.json"))

const anthropicConfig: ConfigObject = {
  schema: "@executioncontrolprotocol.config",
  version: "1.0",
  id: "anthropic/default",
  plugin: "@executioncontrolprotocol/anthropic",
  values: {},
  objectVersion: 1,
  updatedAt: "2026-11-14T00:00:00.000Z",
}

function readText(absolutePath: string): Promise<string> {
  return Promise.resolve(readFileSync(absolutePath, "utf8"))
}

describe("manifest conformance", () => {
  it("accepts every valid fixture", async () => {
    const dir = path.join(manifests, "valid")
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ecp.json"))) {
      const manifest = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as unknown
      const result = await validateExecution(manifest, {
        capabilities: [...testCapabilities, ...creativeCapabilities],
        configs: [anthropicConfig],
        executionDir: dir,
        readText,
      })
      expect(result.issues.filter((issue) => issue.severity === "error"), name).toEqual([])
    }
  })

  it("matches the expected issues for every invalid fixture", async () => {
    const dir = path.join(manifests, "invalid")
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ecp.json"))) {
      const manifest = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as unknown
      const expected = JSON.parse(readFileSync(path.join(dir, name.replace(/\.ecp\.json$/, ".expected.json")), "utf8")) as Array<{
        code: string
        path: string
        severity: string
      }>
      const result = await validateExecution(manifest, {
        capabilities: testCapabilities,
        executionDir: dir,
        readText,
      })
      const actual = result.issues.map((issue) => ({ code: issue.code, path: issue.path, severity: issue.severity }))
      for (const issue of expected) {
        expect(actual, `${name} missing ${issue.code} ${issue.path}`).toContainEqual(issue)
      }
    }
  })
})
