import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { Command } from "@oclif/core"
import type { ExtensionDefinition, PolicyDefinition } from "@executioncontrolprotocol/core"
import { applyGeneratedFields, generatedPackageFields } from "./generated-pjson.js"
import { isReservedRootName } from "../reserved-names.js"
import { toCommands } from "../to-commands.js"
import type { CheckIssue, CheckReport } from "./types.js"

function commandIdsIncludingAliases(
  definition: ExtensionDefinition | PolicyDefinition
): string[] {
  const commands = toCommands(definition)
  const ids = new Set<string>()
  for (const [id, cls] of Object.entries(commands) as [string, Command.Class][]) {
    ids.add(id)
    for (const alias of cls.aliases ?? []) ids.add(alias)
  }
  return [...ids].sort()
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Fail when generated plugin files are stale relative to the compiled definition.
 * @category CLI
 */
export async function checkPlugin(dir: string): Promise<CheckReport> {
  const issues: CheckIssue[] = []
  let definition: ExtensionDefinition | PolicyDefinition
  try {
    const href = pathToFileURL(join(dir, "dist", "index.js")).href
    const mod = (await import(`${href}?check=${Date.now()}`)) as {
      default?: ExtensionDefinition | PolicyDefinition
    }
    if (!mod.default) throw new Error("missing default export")
    definition = mod.default
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      dir,
      ok: false,
      issues: [{ path: "dist/index.js", message: `Cannot load definition: ${message}` }],
    }
  }

  if (isReservedRootName(definition.name)) {
    issues.push({
      path: "definition.name",
      message: `Topic "${definition.name}" collides with a reserved CLI root command`,
    })
  }

  const pkgPath = join(dir, "package.json")
  const pkg = (await readJson(pkgPath)) as Record<string, unknown>
  const existingKeywords = Array.isArray(pkg.keywords) ? pkg.keywords.map(String) : []
  if (!isReservedRootName(definition.name)) {
    const expected = applyGeneratedFields(pkg, generatedPackageFields(definition, existingKeywords))
    if (!deepEqual(pkg.oclif, expected.oclif)) {
      issues.push({ path: "package.json#oclif", message: "oclif block is stale; run ecp plugins build" })
    }
  } else if (pkg.oclif !== undefined) {
    issues.push({ path: "package.json#oclif", message: "oclif block is stale; run ecp plugins build" })
  }
  const ecp = pkg.ecp as { extension?: string } | undefined
  if (ecp?.extension !== "./dist/index.js") {
    issues.push({ path: "package.json#ecp.extension", message: "ecp.extension is missing or stale" })
  }
  const exportsValue = pkg.exports as Record<string, unknown> | undefined
  const oclifExport = exportsValue?.["./oclif"] as { import?: string } | string | undefined
  const oclifImport =
    typeof oclifExport === "string" ? oclifExport : oclifExport?.import
  if (oclifImport !== "./dist/oclif.js") {
    issues.push({ path: "package.json#exports./oclif", message: "exports['./oclif'] is missing or stale" })
  }

  try {
    await readFile(join(dir, "dist", "oclif.js"), "utf8")
  } catch {
    issues.push({ path: "dist/oclif.js", message: "missing generated oclif entry; run ecp plugins build" })
  }

  try {
    const manifest = (await readJson(join(dir, "oclif.manifest.json"))) as {
      commands?: Record<string, unknown>
    }
    const expectedIds = commandIdsIncludingAliases(definition)
    const actualIds = Object.keys(manifest.commands ?? {}).sort()
    if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
      issues.push({
        path: "oclif.manifest.json",
        message: `command ids stale: expected ${expectedIds.join(", ") || "(none)"}`,
      })
    }
  } catch {
    issues.push({
      path: "oclif.manifest.json",
      message: "missing generated manifest; run ecp plugins build",
    })
  }

  return { dir, ok: issues.length === 0, issues }
}
