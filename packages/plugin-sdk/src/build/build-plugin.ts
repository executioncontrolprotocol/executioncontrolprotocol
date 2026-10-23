import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Config } from "@oclif/core"
import type { ExtensionDefinition, PolicyDefinition } from "@executioncontrolprotocol/core"
import { toCommands } from "../to-commands.js"
import { applyGeneratedFields, generatedPackageFields } from "./generated-pjson.js"
import type { BuildReport } from "./types.js"

const OCLIF_JS = `import { toCommands } from "@executioncontrolprotocol/plugin-sdk"
import definition from "./index.js"

export const COMMANDS = toCommands(definition)
`

async function loadDefinition(dir: string): Promise<ExtensionDefinition | PolicyDefinition> {
  const href = pathToFileURL(join(dir, "dist", "index.js")).href
  const mod = (await import(href)) as { default?: ExtensionDefinition | PolicyDefinition }
  if (!mod.default) {
    throw new Error(`Plugin at ${dir} must default-export an extension or policy definition`)
  }
  return mod.default
}

/**
 * Generate oclif files and package.json fields from the compiled definition.
 * @category CLI
 */
export async function buildPlugin(dir: string): Promise<BuildReport> {
  const definition = await loadDefinition(dir)
  const pkgPath = join(dir, "package.json")
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>
  const existingKeywords = Array.isArray(pkg.keywords) ? pkg.keywords.map(String) : []
  const fields = generatedPackageFields(definition, existingKeywords)
  const next = applyGeneratedFields(pkg, fields)
  await writeFile(pkgPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")
  await writeFile(join(dir, "dist", "oclif.js"), OCLIF_JS, "utf8")

  const commands = toCommands(definition)
  const commandIds = Object.keys(commands)
  const config = await Config.load({ root: dir })
  const cached: Record<string, unknown> = {}
  for (const cmd of config.commands) {
    cached[cmd.id] = cmd
  }
  const manifest = {
    version: typeof pkg.version === "string" ? pkg.version : "0.0.0",
    commands: cached,
  }
  await writeFile(join(dir, "oclif.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")

  return {
    dir,
    written: ["package.json", "dist/oclif.js", "oclif.manifest.json"],
    definitionId: definition.id,
    commandIds,
  }
}
