import { Args, Command, Flags } from "@oclif/core"
import {
  createOclifPlugins,
  expandFriendlyName,
  findPluginEntry,
  isPluginSpecInstalled,
  isMissingOclifKeyError,
  manifestInvalidError,
  manifestReportForRoot,
  missingOclifKeyError,
  npmLogLevel,
  resolvePackageSpecifier,
  touchPluginsChangedMarker,
  readPackageVersion,
  userPluginRoot,
} from "../../lib/plugin-mgmt.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp plugins install` — add an ECP provider package under `$ECP_DATA_DIR`.
 * @category CLI
 */
export default class PluginsInstall extends Command {
  static override description =
    "Install an ECP plugin from npm or a local tarball; use a short name like test for @executioncontrolprotocol/plugin-test."

  static override aliases = ["plugins:add"]

  static override args = {
    package: Args.string({
      description: "npm package, friendly short name, or path to a .tgz file.",
      required: true,
    }),
  }

  static override examples = [
    {
      description: "Installs the Anthropic provider from npm.",
      command: "<%= config.bin %> plugins install @executioncontrolprotocol/plugin-anthropic",
    },
    {
      description: "Installs @executioncontrolprotocol/plugin-test by its short name.",
      command: "<%= config.bin %> plugins install test",
    },
    {
      description: "Installs from a packed tarball (path or file: URL).",
      command: "<%= config.bin %> plugins install ./dist/plugin.tgz",
    },
  ]

  static override flags = {
    force: Flags.boolean({
      description: "Reinstall even when the package is already present.",
      default: false,
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Show npm install output on stderr.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(PluginsInstall)
    const logLevel = npmLogLevel(flags)
    const plugins = await createOclifPlugins(this.config, logLevel)
    const { spec, displayName, tag } = resolvePackageSpecifier(args.package, this.config)
    const unfriendly = plugins.unfriendlyName(spec) ?? expandFriendlyName(spec, this.config)

    const installed = await isPluginSpecInstalled(plugins, spec, this.config)
    if (installed && !flags.force) {
      const entry = (typeof installed === "object" ? installed : await findPluginEntry(plugins, unfriendly)) as
        | { name: string; type?: string; root?: string }
        | undefined
      const root =
        entry?.type === "link" && entry.root
          ? entry.root
          : userPluginRoot(this.config.dataDir!, entry?.name ?? unfriendly)
      const manifest = await manifestReportForRoot(root, entry?.type === "link" ? "link" : "user")
      if (!manifest.ok) {
        touchPluginsChangedMarker(this.config.dataDir)
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
            action: "install",
            package: entry?.name ?? unfriendly,
            version: readPackageVersion(root),
            type: (entry?.type === "link" ? "link" : "user") as "user" | "link",
            root,
            alreadyInstalled: true,
            manifest: { ok: true },
          },
        },
        {
          json: flags.json,
          human: () => this.log(`${displayName} is already installed.`),
          exitCode: 0,
        },
      )
    }

    let pluginConfig
    try {
      pluginConfig = await plugins.install(spec, { force: flags.force, tag })
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

    const entry = await findPluginEntry(plugins, pluginConfig.name)
    const root = pluginConfig.root
    const manifest = await manifestReportForRoot(root, "user")
    touchPluginsChangedMarker(this.config.dataDir)
    if (!manifest.ok) {
      writeEnvelope(
        {
          ok: false,
          error: manifestInvalidError(manifest.issues),
        },
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
          action: "install",
          package: pluginConfig.name,
          version: pluginConfig.version,
          type: (entry?.type === "link" ? "link" : "user") as "user" | "link",
          root,
          manifest: { ok: true },
        },
      },
      {
        json: flags.json,
        human: () => this.log(`installed ${pluginConfig.name}@${pluginConfig.version}`),
        exitCode: 0,
      },
    )
  }
}