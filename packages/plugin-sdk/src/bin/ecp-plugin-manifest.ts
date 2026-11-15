#!/usr/bin/env node
import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { buildPluginManifest, serializeManifest, type PluginDefinition } from "../index.js"

async function main(argv: string[]): Promise<void> {
  const check = argv.includes("--check")
  const cwd = process.cwd()
  const entryPath = path.resolve(cwd, "dist/index.js")
  const packagePath = path.resolve(cwd, "package.json")
  const manifestPath = path.resolve(cwd, "ecp.manifest.json")

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

  const manifest = await buildPluginManifest({
    definition: mod.default,
    packageJson: { name: packageJson.name, version: packageJson.version },
  })
  if (manifest.plugin.version !== packageJson.version) {
    fail(`Manifest plugin.version ${manifest.plugin.version} does not match package.json version ${packageJson.version}.`)
  }

  const next = serializeManifest(manifest)
  if (check) {
    let current: string
    try {
      current = await readFile(manifestPath, "utf8")
    } catch {
      fail(`ecp.manifest.json is missing at ${manifestPath}.`)
      return
    }
    if (current !== next) {
      fail(`ecp.manifest.json is out of date at ${manifestPath}. Run ecp-plugin-manifest to regenerate.`)
    }
    process.stdout.write(`ecp.manifest.json matches ${manifestPath}\n`)
    return
  }

  await writeFile(manifestPath, next, "utf8")
  process.stdout.write(`Wrote ${manifestPath}\n`)
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
