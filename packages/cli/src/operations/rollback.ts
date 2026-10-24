import { z } from "zod"
import { defineOperation } from "@executioncontrolprotocol/plugin-sdk"
import { listInstalledPlugins } from "../lib/installed-plugins.js"

/** `ecp rollback`. @category CLI */
export const rollbackOperation = defineOperation("rollback")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Remove user overrides of bundled plugins",
    description:
      "Uninstall user-installed plugins that shadow a bundled (core) plugin so the CLI copy is used again.",
    useCases: ["Undo a local override of a bundled plugin"],
    examples: ["ecp rollback"],
  })
  .withHandler(async (_input, ctx) => {
    const plugins = listInstalledPlugins(ctx.config)
    const coreNames = new Set(
      plugins.filter((plugin) => plugin.type === "core").map((plugin) => plugin.name)
    )
    const overrides = plugins.filter(
      (plugin) => (plugin.type === "user" || plugin.type === "link") && coreNames.has(plugin.name)
    )
    const removed: string[] = []
    for (const plugin of overrides) {
      await ctx.config.runCommand("plugins:uninstall", [plugin.name])
      removed.push(plugin.name)
    }
    return { removed }
  })
  .build()
