import { z } from "zod"
import { defineOperation, EcpCliError, EXIT_FAILED } from "@executioncontrolprotocol/plugin-sdk"
import { confirm } from "../lib/confirm.js"
import { listInstalledPlugins } from "../lib/installed-plugins.js"
import { npmLatestVersion } from "../lib/npm-registry.js"

function isNewer(latest: string, current: string): boolean {
  return latest !== current && latest.localeCompare(current, undefined, { numeric: true }) > 0
}

/** `ecp update`. @category CLI */
export const updateOperation = defineOperation("update")
  .withInput(
    z.object({
      list: z.boolean().optional(),
      interactive: z.boolean().optional(),
      "no-confirm": z.boolean().optional(),
    })
  )
  .withMetadata({
    summary: "Update user-installed ECP plugins",
    description:
      "List user plugins with newer versions on npm and install them. Core (bundled) plugins are not updatable this way; reinstall the CLI instead.",
    useCases: ["Bring user plugins up to date"],
    examples: ["ecp update --list", "ecp update --no-confirm"],
  })
  .withHandler(async (input, ctx) => {
    const plugins = listInstalledPlugins(ctx.config)
    const user = plugins.filter((plugin) => plugin.type === "user" || plugin.type === "link")
    const coreNames = new Set(
      plugins.filter((plugin) => plugin.type === "core").map((plugin) => plugin.name)
    )
    const available: Array<{
      name: string
      current: string
      latest: string
      shadowsBundled: boolean
    }> = []
    try {
      for (const plugin of user) {
        const latest = await npmLatestVersion(plugin.name)
        if (!latest || !plugin.version) continue
        if (!isNewer(latest, plugin.version)) continue
        available.push({
          name: plugin.name,
          current: plugin.version,
          latest,
          shadowsBundled: coreNames.has(plugin.name),
        })
      }
    } catch (err) {
      throw new EcpCliError(
        "ECP_UPDATE_FAILED",
        err instanceof Error ? err.message : String(err),
        { exitCode: EXIT_FAILED }
      )
    }
    const warnings = available
      .filter((row) => row.shadowsBundled)
      .map((row) => `${row.name} shadows a bundled plugin; latest on npm is ${row.latest}`)
    if (input.list || available.length === 0) {
      return { plugins: available, warnings }
    }
    const skipConfirm = Boolean(input["no-confirm"])
    const ok =
      skipConfirm ||
      (input.interactive ? await confirm(`Update ${available.length} plugin(s)?`, ctx.argv) : true)
    if (!ok) return { plugins: available, warnings, updated: [] }
    const updated: string[] = []
    for (const row of available) {
      await ctx.config.runCommand("plugins:install", [`${row.name}@${row.latest}`])
      updated.push(row.name)
    }
    return { plugins: available, warnings, updated }
  })
  .build()
