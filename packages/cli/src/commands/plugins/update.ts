import { Command, Flags } from "@oclif/core"
import {
  createOclifPlugins,
  npmLogLevel,
  touchPluginsChangedMarker,
  userPluginRoot,
  readPackageVersion,
} from "../../lib/plugin-mgmt.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp plugins update` — refresh user-installed plugins from npm.
 * @category CLI
 */
export default class PluginsUpdate extends Command {
  static override description =
    "Update user-installed ECP plugins from npm; linked plugins are left unchanged."

  static override examples = [
    {
      description: "Refreshes registry packages when any are installed; exits 0 when there are none.",
      command: "<%= config.bin %> plugins update --json",
    },
  ]

  static override flags = {
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
    const { flags } = await this.parse(PluginsUpdate)
    const logLevel = npmLogLevel(flags)
    const plugins = await createOclifPlugins(this.config, logLevel)
    const before = await plugins.list()
    const userBefore = before.filter((entry) => entry.type === "user")
    if (userBefore.length === 0) {
      writeEnvelope(
        { ok: true, data: { action: "update", updated: [] as Array<{ package: string; version: string }> } },
        {
          json: flags.json,
          human: () => this.log("No user-installed plugins to update."),
          exitCode: 0,
        },
      )
    }

    try {
      await plugins.update()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeEnvelope(
        { ok: false, error: { code: "ECP_INTERNAL", message, path: "" } },
        {
          json: flags.json,
          human: () => this.error(message, { exit: 1 }),
          exitCode: 1,
        },
      )
    }

    const after = await plugins.list()
    const dataDir = this.config.dataDir!
    const updated: Array<{ package: string; version: string }> = []
    for (const entry of userBefore) {
      const next = after.find((row) => row.name === entry.name)
      if (next) {
        const root = userPluginRoot(dataDir, entry.name)
        updated.push({ package: entry.name, version: readPackageVersion(root) })
      }
    }
    touchPluginsChangedMarker(this.config.dataDir)
    writeEnvelope(
      { ok: true, data: { action: "update", updated } },
      {
        json: flags.json,
        human: () => {
          if (updated.length === 0) this.log("No plugins updated.")
          else for (const row of updated) this.log(`updated ${row.package}`)
        },
        exitCode: 0,
      },
    )
  }
}