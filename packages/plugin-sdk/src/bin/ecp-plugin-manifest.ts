#!/usr/bin/env node
import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { canonicalJson, sha256Hex } from "../canonical.js"
import {
  buildPluginManifest,
  buildPluginSchemaDocument,
  serializeManifest,
  serializePluginSchema,
  type PluginDefinition,
} from "../index.js"

async function main(argv: string[]): Promise<void> {
  const check = argv.includes("--check")
  const cwd = process.cwd()
  const entryPath = path.resolve(cwd, "dist/index.js")
  const packagePath = path.resolve(cwd, "package.json")
  const manifestPath = path.resolve(cwd, "ecp.manifest.json")
  const schemaPath = path.resolve(cwd, "ecp.schema.json")

  await assertExists(entryPath, `Built entry ${entryPath} was not found. Run tsc before ecp-plugin-manifest.`)
  await assertExists(packagePath, `package.json was not found in ${cwd}.`)

  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    name?: string
    version?: string
  }
  if (!packageJson.name || !packageJson.version) {
    fail("package.json must declare name and version.")
  }

  const mod = (await import(pathToFileURL(entryPath).href)) as { default?: PluginDefinition }
  if (!mod.default || typeof mod.default !== "object" || !("id" in mod.default)) {
    fail(`${entryPath} must default-export a definePlugin(...) definition.`)
  }

  const schemaDocument = await buildPluginSchemaDocument({
    definition: mod.default,
    packageJson: { name: packageJson.name, version: packageJson.version },
  })
  const manifest = await buildPluginManifest({
    definition: mod.default,
    packageJson: { name: packageJson.name, version: packageJson.version },
    schemaDocument,
  })
  if (manifest.plugin.version !== packageJson.version) {
    fail(`Manifest plugin.version ${manifest.plugin.version} does not match package.json version ${packageJson.version}.`)
  }

  const expectedSchemaHash = await sha256Hex(canonicalJson(schemaDocument))
  if (manifest.pluginSchema.hash !== expectedSchemaHash) {
    fail(
      `pluginSchema.hash ${manifest.pluginSchema.hash} does not match the schema document hash ${expectedSchemaHash}.`,
    )
  }

  const nextManifest = serializeManifest(manifest)
  const nextSchema = serializePluginSchema(schemaDocument)

  if (check) {
    let currentManifest: string
    try {
      currentManifest = await readFile(manifestPath, "utf8")
    } catch {
      fail(`ecp.manifest.json is missing at ${manifestPath}.`)
      return
    }
    let currentSchema: string
    try {
      currentSchema = await readFile(schemaPath, "utf8")
    } catch {
      fail(`ecp.schema.json is missing at ${schemaPath}. Run ecp-plugin-manifest to regenerate.`)
      return
    }
    if (currentManifest !== nextManifest) {
      fail(`ecp.manifest.json is out of date at ${manifestPath}. Run ecp-plugin-manifest to regenerate.`)
    }
    if (currentSchema !== nextSchema) {
      fail(`ecp.schema.json is out of date at ${schemaPath}. Run ecp-plugin-manifest to regenerate.`)
    }
    const onDiskSchema = JSON.parse(currentSchema) as unknown
    const onDiskHash = await sha256Hex(canonicalJson(onDiskSchema))
    if (manifest.pluginSchema.hash !== onDiskHash) {
      fail(
        `pluginSchema.hash does not match ecp.schema.json at ${schemaPath}. Run ecp-plugin-manifest to regenerate.`,
      )
    }
    process.stdout.write(`ecp.manifest.json and ecp.schema.json match ${cwd}\n`)
    return
  }

  await writeFile(manifestPath, nextManifest, "utf8")
  await writeFile(schemaPath, nextSchema, "utf8")
  process.stdout.write(`Wrote ${manifestPath}\n`)
  process.stdout.write(`Wrote ${schemaPath}\n`)
}

async function assertExists(filePath: string, message: string): Promise<void> {
  try {
    await access(filePath)
  } catch {
    fail(message)
  }
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  fail(message)
})
