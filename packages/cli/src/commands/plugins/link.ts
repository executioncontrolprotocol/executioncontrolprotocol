import { Args, Command, Flags } from "@oclif/core"
import path from "node:path"
import {
  createOclifPlugins,
  isMissingOclifKeyError,
  manifestInvalidError,
  manifestReportForRoot,
  missingOclifKeyError,
  npmLogLevel,
  touchPluginsChangedMarker,
} from "../../lib/plugin-mgmt.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp plugins link` — register a local plugin package under `$ECP_DATA_DIR`.
 * @category CLI
 */
export default class PluginsLink extends Command {
  static override description =
    "Link a local ECP plugin directory for development; dependencies install by default unless you pass --no-install."

  static override args = {
    path: Args.string({
      description: "Path to the plugin package root.",
      default: ".",
    }),
  }

  static override examples = [
    {
      description: "Links plugin-test from the monorepo without running install in the plugin directory.",
      command: "<%= config.bin %> plugins link ./plugins/plugin-test --no-install",
    },
  ]

  static override flags = {
    install: Flags.boolean({
      description: "Run the package manager in the plugin directory before linking.",
      default: true,
      allowNo: true,
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Show npm or yarn output on stderr.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(PluginsLink)
    const logLevel = npmLogLevel(flags)
    const plugins = await createOclifPlugins(this.config, logLevel)
    const target = path.resolve(args.path)

    let pluginConfig
    try {
      pluginConfig = await plugins.link(target, { install: flags.install })
    } catch (error) {
      if (isMissingOclifKeyError(error)) {
        touchPluginsChangedMarker(this.config.dataDir)
        writeEnvelope(
          { ok: false, error: missingOclifKeyError() },
          {
            json: flags.json,
            human: () => this.error(missingOclifKeyError().message, { exit: 2 }),
            exitCode: 2,
          },
        )
      }
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

    const manifest = await manifestReportForRoot(pluginConfig.root, "link")
    touchPluginsChangedMarker(this.config.dataDir)
    if (!manifest.ok) {
      writeEnvelope(
        { ok: false, error: manifestInvalidError(manifest.issues) },
        {
          json: flags.json,
          human: () => this.error(manifestInvalidError(manifest.issues).message, { exit: 2 }),
          exitCode: 2,
        },
      )
    }
    writeEnvelope(
      {
        ok: true,
        data: {
          action: "link",
          package: pluginConfig.name,
          version: pluginConfig.version,
          type: "link" as const,
          root: pluginConfig.root,
          manifest: { ok: true },
        },
      },
      {
        json: flags.json,
        human: () => this.log(`linked ${pluginConfig.name} at ${pluginConfig.root}`),
        exitCode: 0,
      },
    )
  }
}