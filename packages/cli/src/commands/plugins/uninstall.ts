import { Args, Command, Flags } from "@oclif/core"
import {
  createOclifPlugins,
  expandFriendlyName,
  isCliPackageName,
  npmLogLevel,
  touchPluginsChangedMarker,
} from "../../lib/plugin-mgmt.js"
import { writeEnvelope } from "../../lib/output.js"

const BUNDLED_CORE_PACKAGES = new Set([
  "@executioncontrolprotocol/core",
  "@executioncontrolprotocol/plugin-core",
])

/**
 * Whether the name refers to the bundled core plugin (cannot be uninstalled).
 * @category CLI
 */
export function isBundledCorePluginName(name: string, expanded: string): boolean {
  const trimmed = name.trim().toLowerCase()
  if (trimmed === "core" || trimmed === "plugin-core") return true
  return BUNDLED_CORE_PACKAGES.has(expanded) || BUNDLED_CORE_PACKAGES.has(name.trim())
}

/**
 * `ecp plugins uninstall` — remove a linked or installed ECP plugin.
 * @category CLI
 */
export default class PluginsUninstall extends Command {
  static override description = "Remove an installed or linked ECP plugin from $ECP_DATA_DIR."

  static override aliases = ["plugins:unlink", "plugins:remove"]

  static override args = {
    package: Args.string({
      description: "npm package or friendly short name to remove.",
      required: true,
    }),
  }

  static override examples = [
    {
      description: "Uninstalls plugin-test by short name.",
      command: "<%= config.bin %> plugins uninstall test",
    },
  ]

  static override flags = {
    verbose: Flags.boolean({
      char: "v",
      description: "Show npm uninstall output on stderr.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(PluginsUninstall)
    const expanded = expandFriendlyName(args.package, this.config)
    if (isBundledCorePluginName(args.package, expanded)) {
      const message = "The core plugin is bundled with the host and cannot be uninstalled."
      writeEnvelope(
        { ok: false, error: { code: "ECP_USAGE", message, path: "" } },
        {
          json: flags.json,
          human: () => this.error(message, { exit: 2 }),
          exitCode: 2,
        },
      )
    }
    if (isCliPackageName(expanded, this.config)) {
      writeEnvelope(
        { ok: false, error: { code: "ECP_USAGE", message: "Cannot uninstall the ecp CLI package.", path: "" } },
        {
          json: flags.json,
          human: () => this.error("Cannot uninstall the ecp CLI package.", { exit: 2 }),
          exitCode: 2,
        },
      )
    }
    const logLevel = npmLogLevel(flags)
    const plugins = await createOclifPlugins(this.config, logLevel)
    const unfriendly = plugins.unfriendlyName(expanded) ?? expanded
    const present = await plugins.hasPlugin(unfriendly)
    if (!present) {
      writeEnvelope(
        { ok: false, error: { code: "ECP_NOT_FOUND", message: `Plugin ${expanded} is not installed.`, path: "" } },
        {
          json: flags.json,
          human: () => this.error(`Plugin ${expanded} is not installed.`, { exit: 2 }),
          exitCode: 2,
        },
      )
    }

    await plugins.uninstall(unfriendly)
    touchPluginsChangedMarker(this.config.dataDir)
    writeEnvelope(
      {
        ok: true,
        data: { action: "uninstall", package: unfriendly, removed: true },
      },
      {
        json: flags.json,
        human: () => this.log(`uninstalled ${unfriendly}`),
        exitCode: 0,
      },
    )
  }
}