import { Command, Flags } from "@oclif/core"
import { rm } from "node:fs/promises"
import path from "node:path"
import {
  createOclifPlugins,
  npmLogLevel,
  touchPluginsChangedMarker,
  type OclifPluginEntry,
} from "../../lib/plugin-mgmt.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp plugins reset` — remove all user-installed and linked plugins.
 * @category CLI
 */
export default class PluginsReset extends Command {
  static override description =
    "Remove linked and user-installed plugins under $ECP_DATA_DIR; the bundled core plugin stays loaded. Optional --hard deletes node_modules and lockfiles."

  static override examples = [
    {
      description: "Uninstalls each registered plugin without deleting the whole data directory.",
      command: "<%= config.bin %> plugins reset --json",
    },
  ]

  static override flags = {
    hard: Flags.boolean({
      description: "Delete node_modules, package.json, and lockfiles under the plugins data dir.",
      default: false,
    }),
    reinstall: Flags.boolean({
      description: "Reinstall or relink plugins after removal (may need network for registry packages).",
      default: false,
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Show npm output on stderr.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(PluginsReset)
    const logLevel = npmLogLevel(flags)
    const plugins = await createOclifPlugins(this.config, logLevel)
    const userPlugins = await plugins.list()
    const removed: Array<{ package: string; type: string }> = userPlugins.map((entry) => ({
      package: entry.name,
      type: entry.type ?? "user",
    }))

    if (flags.hard) {
      const dataDir = this.config.dataDir!
      const files = [
        path.join(dataDir, "node_modules"),
        path.join(dataDir, "package.json"),
        path.join(dataDir, "yarn.lock"),
        path.join(dataDir, "package-lock.json"),
      ]
      await Promise.all(files.map((file) => rm(file, { force: true, recursive: true })))
    } else {
      for (const plugin of userPlugins) {
        try {
          await plugins.uninstall(plugin.name)
        } catch {
          this.warn(`Failed to uninstall ${plugin.name}`)
        }
      }
    }

    if (flags.reinstall) {
      for (const plugin of userPlugins) {
        await reinstallOne(plugins, plugin, (message) => this.warn(message))
      }
    }

    if (removed.length > 0) touchPluginsChangedMarker(this.config.dataDir)
    writeEnvelope(
      {
        ok: true,
        data: { action: "reset", removed, hard: flags.hard, reinstall: flags.reinstall },
      },
      {
        json: flags.json,
        human: () => {
          if (removed.length === 0) this.log("No plugins to reset.")
          else for (const row of removed) this.log(`removed ${row.package} (${row.type})`)
          this.log("Bundled core plugin (@executioncontrolprotocol/core) remains loaded with the host.")
        },
        exitCode: 0,
      },
    )
  }
}

async function reinstallOne(
  plugins: Awaited<ReturnType<typeof createOclifPlugins>>,
  plugin: OclifPluginEntry,
  warn: (message: string) => void,
): Promise<void> {
  if (plugin.type === "link" && plugin.root) {
    try {
      await plugins.link(plugin.root, { install: false })
    } catch {
      warn(`Failed to relink ${plugin.name}`)
    }
    return
  }
  if (plugin.type === "user") {
    try {
      if (plugin.url) await plugins.install(plugin.url)
      else await plugins.install(plugin.name, { tag: plugin.tag })
    } catch {
      warn(`Failed to reinstall ${plugin.name}`)
    }
  }
}