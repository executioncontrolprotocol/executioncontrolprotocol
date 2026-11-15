import { z } from "zod"
import { defineOperation, EcpCliError, EXIT_FAILED } from "@executioncontrolprotocol/plugin-sdk"
import { confirm } from "../lib/confirm.js"
import { installedPluginNames } from "../lib/installed-plugins.js"
import { isFirstPartyPackage, searchEcpPlugins, type NpmSearchHit } from "../lib/npm-registry.js"

function sortHits(
  hits: NpmSearchHit[],
  field: string | undefined,
  order: string | undefined
): NpmSearchHit[] {
  const dir = order === "desc" ? -1 : 1
  const key = field === "date" ? "date" : "name"
  return [...hits].sort((a, b) => {
    const left = key === "date" ? a.date ?? "" : a.name
    const right = key === "date" ? b.date ?? "" : b.name
    return left.localeCompare(right) * dir
  })
}

/** `ecp plugins discover`. @category CLI */
export const discoverOperation = defineOperation("plugins:discover")
  .withInput(
    z.object({
      query: z.string().optional(),
      all: z.boolean().optional(),
      install: z.boolean().optional(),
      "sort-field": z.enum(["date", "name"]).optional(),
      "sort-order": z.enum(["asc", "desc"]).optional(),
    })
  )
  .withMetadata({
    summary: "Discover ECP plugins on npm",
    description:
      "Search the npm registry for packages tagged ecosystem:ecp-plugin. First-party packages are marked; installed plugins are hidden unless --all.",
    useCases: ["Find a plugin to install", "List first-party plugins"],
    examples: ["ecp plugins discover jsonata --json", "ecp plugins discover --sort-field name"],
    cli: { args: ["query"] },
  })
  .withHandler(async (input, ctx) => {
    let hits: NpmSearchHit[]
    try {
      hits = await searchEcpPlugins(input.query ? String(input.query) : "")
    } catch (err) {
      throw new EcpCliError(
        "ECP_DISCOVER_FAILED",
        err instanceof Error ? err.message : String(err),
        { exitCode: EXIT_FAILED }
      )
    }
    const installed = installedPluginNames(ctx.config)
    const visible = input.all ? hits : hits.filter((hit) => !installed.has(hit.name))
    const sorted = sortHits(visible, input["sort-field"] ? String(input["sort-field"]) : "name", String(input["sort-order"] ?? "asc"))
    const rows = sorted.map((hit) => ({
      name: hit.name,
      version: hit.version,
      description: hit.description,
      firstParty: isFirstPartyPackage(hit.name),
      installed: installed.has(hit.name),
    }))
    if (input.install && rows.length > 0) {
      const names = rows.map((row) => row.name)
      const ok = await confirm(`Install ${names.length} plugin(s)?`, ctx.argv)
      if (ok) {
        for (const name of names) {
          await ctx.config.runCommand("plugins:install", [name])
        }
      }
    }
    return { plugins: rows }
  })
  .build()
