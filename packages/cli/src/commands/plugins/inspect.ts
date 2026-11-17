import { Args, Command, Config, Flags } from "@oclif/core"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { ecpDataDir } from "../../lib/home.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp plugins inspect` — resolve plugins from `$ECP_DATA_DIR/package.json` because
 * the CLI runs with `userPlugins: false` (they are not in `config.plugins`).
 * @category CLI
 */
export default class PluginsInspect extends Command {
  static override description =
    "Show where a plugin is installed on disk; use the top-level plugins command for host manifest status."

  static override strict = false

  static override examples = [
    {
      description: "Prints where @executioncontrolprotocol/plugin-test is installed (friendly name: test).",
      command: "<%= config.bin %> plugins inspect test",
    },
  ]

  static override args = {
    plugin: Args.string({
      description: "Plugin package or friendly name to inspect.",
      required: true,
    }),
  }

  static override flags = {
    verbose: Flags.boolean({
      char: "v",
      description: "Include dependency versions in the output.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { argv, flags } = await this.parse(PluginsInspect)
    const names = (argv.length > 0 ? argv : ["."]).map(String)
    const results: Array<Awaited<ReturnType<typeof describePlugin>>> = []
    for (const raw of names) {
      const name = raw === "." ? readLocalPackageName() : expandFriendlyName(raw, this.config)
      const entry = findDiskPlugin(this.config.dataDir || ecpDataDir(), name)
      if (!entry) {
        const loaded = this.config.getPluginsList().find((plugin) => plugin.name === name)
        if (!loaded) this.error(`${name} not installed`)
        results.push(await describePlugin(loaded.root, loaded.name, "core", flags.verbose))
        continue
      }
      const root =
        entry.type === "link" && entry.root
          ? entry.root
          : path.join(this.config.dataDir || ecpDataDir(), "node_modules", entry.name)
      results.push(await describePlugin(root, entry.name, entry.type ?? "user", flags.verbose))
    }
    writeEnvelope(
      { ok: true, data: { items: results } },
      {
        json: flags.json,
        human: () => {
          for (const result of results) {
            this.log(`${result.name} ${result.version} (${result.type})`)
            this.log(`  location ${result.root}`)
            if (flags.verbose && result.dependencies) {
              for (const [dep, version] of Object.entries(result.dependencies)) {
                this.log(`  ${dep} ${version}`)
              }
            }
          }
        },
        exitCode: 0,
      },
    )
  }
}

interface DiskPlugin {
  /** Package name. */
  name: string
  /** oclif plugin type. */
  type?: string
  /** Link root when type is link. */
  root?: string
  /** Install tag when present. */
  tag?: string
}

async function describePlugin(
  root: string,
  name: string,
  type: string,
  verbose: boolean,
): Promise<{
  name: string
  version: string
  root: string
  type: string
  dependencies?: Record<string, string>
}> {
  const loaded = await Config.load({ root, devPlugins: false, userPlugins: false })
  const dependencies =
    verbose && loaded.pjson.dependencies
      ? Object.fromEntries(Object.entries(loaded.pjson.dependencies).map(([key, value]) => [key, String(value)]))
      : undefined
  return {
    name: loaded.name || name,
    version: loaded.version,
    root: loaded.root,
    type,
    dependencies,
  }
}

function findDiskPlugin(dataDir: string, name: string): DiskPlugin | undefined {
  const pjsonPath = path.join(dataDir, "package.json")
  if (!existsSync(pjsonPath)) return undefined
  let pjson: {
    oclif?: { plugins?: Array<string | DiskPlugin> }
    dependencies?: Record<string, string>
  }
  try {
    pjson = JSON.parse(readFileSync(pjsonPath, "utf8")) as typeof pjson
  } catch {
    return undefined
  }
  const plugins = (pjson.oclif?.plugins ?? []).map((entry) =>
    typeof entry === "string" ? { name: entry, type: "user", tag: "latest" } : entry,
  )
  const byName =
    plugins.find((plugin) => plugin.name === name) ??
    plugins.find((plugin) => friendlyName(plugin.name) === name)
  if (byName) return byName
  if (pjson.dependencies?.[name]) return { name, type: "user" }
  return undefined
}

function expandFriendlyName(name: string, config: Config): string {
  if (name.includes("@")) return name
  const scope = config.pjson.oclif?.scope
  const prefix = config.pjson.oclif?.pluginPrefix ?? "plugin"
  if (!scope) return name
  return `@${scope}/${prefix}-${name}`
}

function friendlyName(name: string): string {
  const match = name.match(/^@[^/]+\/plugin-(.+)$/)
  return match?.[1] ?? name
}

function readLocalPackageName(): string {
  const pjson = JSON.parse(readFileSync("package.json", "utf8")) as { name?: string }
  if (!pjson.name) throw new Error("package.json has no name")
  return pjson.name
}