import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { buildPlugin } from "../src/build/build-plugin.js"
import { checkPlugin } from "../src/build/check-plugin.js"
import { applyGeneratedFields, generatedPackageFields } from "../src/build/generated-pjson.js"
import { defineExtension, definePolicy, capabilityFor, hook } from "@executioncontrolprotocol/core"
import { z } from "zod"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const jsonataDir = join(repoRoot, "plugins", "plugin-jsonata")
const fireflyDir = join(repoRoot, "plugins", "plugin-adobe-firefly-services")

const scratchDirs: string[] = []

afterEach(async () => {
  await Promise.all(scratchDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ecp-plugin-check-"))
  scratchDirs.push(dir)
  return dir
}

describe("generatedPackageFields", () => {
  it("throws when the topic is a reserved root name", () => {
    const def = defineExtension("@executioncontrolprotocol", "run")
      .withCapabilities([])
      .build()
    expect(() => generatedPackageFields(def)).toThrow(/reserved CLI root/)
  })

  it("uses the policy name when there are no capabilities", () => {
    const pol = definePolicy("@executioncontrolprotocol", "budget")
      .withHooks([hook("policy:pre", () => ({ type: "allow" as const }))])
      .build()
    const fields = generatedPackageFields(pol, ["existing"])
    expect(fields.keywords).toContain("existing")
    expect(fields.keywords).toContain("ecosystem:ecp-plugin")
    expect((fields.oclif.topics as Record<string, { description: string }>).budget.description).toBe("budget")
  })

  it("merges exports and ecp onto an existing package.json", () => {
    const def = defineExtension("@executioncontrolprotocol", "demo")
      .withMetadata({ summary: "Demo", description: "A demo extension." })
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/demo", "ping")
          .withInput(z.object({ n: z.string() }))
          .withOutput(z.object({ n: z.string() }))
          .withHandler(async (input) => input),
      ])
      .build()
    const next = applyGeneratedFields(
      { name: "x", exports: { ".": "./dist/index.js" }, ecp: { extra: true } },
      generatedPackageFields(def)
    )
    expect((next.exports as Record<string, unknown>)["."]).toBe("./dist/index.js")
    expect((next.ecp as { extra: boolean }).extra).toBe(true)
    expect((next.ecp as { extension: string }).extension).toBe("./dist/index.js")
  })

  it("creates exports and ecp when they are missing", () => {
    const def = defineExtension("@executioncontrolprotocol", "demo").withCapabilities([]).build()
    const next = applyGeneratedFields({ name: "x" }, generatedPackageFields(def))
    expect(next.exports).toMatchObject({ "./oclif": { import: "./dist/oclif.js" } })
    expect(next.ecp).toMatchObject({ extension: "./dist/index.js" })
  })

  it("adds a topic alias from metadata.topicAlias", () => {
    const def = defineExtension("@executioncontrolprotocol", "adobe-firefly-services")
      .withMetadata({
        summary: "Call Adobe Firefly Services APIs",
        description: "Generated Adobe Firefly Services capabilities.",
        topicAlias: "firefly",
      })
      .withCapabilities([])
      .build()
    const fields = generatedPackageFields(def)
    const topics = fields.oclif.topics as Record<string, { description: string }>
    expect(topics["adobe-firefly-services"]?.description).toMatch(/Firefly/)
    expect(topics.firefly?.description).toMatch(/Firefly/)
  })

  it("keeps extra package files such as openapi when applying generated fields", () => {
    const def = defineExtension("@executioncontrolprotocol", "demo").withCapabilities([]).build()
    const next = applyGeneratedFields(
      { name: "x", files: ["dist", "README.md", "openapi"] },
      generatedPackageFields(def)
    )
    expect(next.files).toEqual(
      expect.arrayContaining(["dist", "README.md", "openapi", "oclif.manifest.json"])
    )
  })
})

describe("checkPlugin / buildPlugin", () => {
  it("accepts the generated plugin-jsonata package", async () => {
    const report = await checkPlugin(jsonataDir)
    expect(report.ok).toBe(true)
    expect(report.issues).toEqual([])
  })

  it("accepts firefly command aliases in the generated manifest", async () => {
    const report = await checkPlugin(fireflyDir)
    expect(report.ok, JSON.stringify(report.issues)).toBe(true)
    expect(report.issues).toEqual([])
  })

  it("fails when dist/index.js has no default export", async () => {
    const dir = await scratch()
    await mkdir(join(dir, "dist"), { recursive: true })
    await writeFile(join(dir, "dist", "index.js"), "export const x = 1\n", "utf8")
    await writeFile(join(dir, "package.json"), "{}\n", "utf8")
    const report = await checkPlugin(dir)
    expect(report.ok).toBe(false)
    expect(report.issues[0]?.path).toBe("dist/index.js")
  })

  it("fails when the topic is reserved and generated files are missing", async () => {
    const dir = await scratch()
    await mkdir(join(dir, "dist"), { recursive: true })
    await writeFile(
      join(dir, "dist", "index.js"),
      `export default { id: "@executioncontrolprotocol/run", name: "run", version: "1.0.0", capabilities: [] }\n`,
      "utf8"
    )
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "x", oclif: {} }), "utf8")
    const report = await checkPlugin(dir)
    expect(report.ok).toBe(false)
    expect(report.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "definition.name",
        "package.json#oclif",
        "package.json#ecp.extension",
        "package.json#exports./oclif",
        "dist/oclif.js",
        "oclif.manifest.json",
      ])
    )
  })

  it("fails when the oclif block and command ids are stale", async () => {
    const dir = await scratch()
    await mkdir(join(dir, "dist"), { recursive: true })
    await writeFile(
      join(dir, "dist", "index.js"),
      `export default {
        id: "@executioncontrolprotocol/demo",
        name: "demo",
        version: "1.0.0",
        capabilities: [{ id: "@executioncontrolprotocol/demo.ping", name: "ping" }],
        metadata: { summary: "Demo", description: "Demo." }
      }\n`,
      "utf8"
    )
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "x",
        ecp: { extension: "./dist/index.js" },
        exports: { "./oclif": { import: "./dist/oclif.js" } },
        oclif: { bin: "not-ecp" },
      }),
      "utf8"
    )
    await writeFile(join(dir, "dist", "oclif.js"), "export const COMMANDS = {}\n", "utf8")
    await writeFile(join(dir, "oclif.manifest.json"), JSON.stringify({ commands: { "other:cmd": {} } }), "utf8")
    const report = await checkPlugin(dir)
    expect(report.ok).toBe(false)
    expect(report.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["package.json#oclif", "oclif.manifest.json"])
    )
  })

  it("buildPlugin rewrites generated files for plugin-jsonata", async () => {
    const report = await buildPlugin(jsonataDir)
    expect(report.definitionId).toBe("@executioncontrolprotocol/jsonata")
    expect(report.commandIds).toEqual(["jsonata:transform"])
    expect(report.written).toEqual(["package.json", "dist/oclif.js", "oclif.manifest.json"])
    const recheck = await checkPlugin(jsonataDir)
    expect(recheck.ok).toBe(true)
  }, 30_000)
})
