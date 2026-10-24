import type { Interfaces } from "@oclif/core"
import type { RequirementsDocument } from "@executioncontrolprotocol/core"
import {
  ECP_PLUGINS_MISSING,
  EcpCliError,
  EXIT_PLUGINS_MISSING,
  type EcpHost,
} from "@executioncontrolprotocol/plugin-sdk"
import { confirmDefaultYes, wantsYes } from "./confirm.js"
import { rebuildProcessHost } from "./layer-environment.js"
import { findMissingPlugins, type MissingPlugin } from "./missing-plugins.js"

function throwMissing(missing: MissingPlugin[]): never {
  throw new EcpCliError(
    ECP_PLUGINS_MISSING,
    `Missing plugins: ${missing.map((row) => row.package).join(", ")}`,
    {
      exitCode: EXIT_PLUGINS_MISSING,
      details: missing,
      suggestions: missing.map((row) => row.command),
    }
  )
}

/**
 * Ensure required plugins are installed. `validate` never installs.
 * Interactive run prompts per package; `--json` / non-TTY throw {@link ECP_PLUGINS_MISSING}.
 * @category CLI
 */
export async function ensurePluginsInstalled(options: {
  requirements: RequirementsDocument
  config: Interfaces.Config
  argv: string[]
  json: boolean
  install: boolean
  host?: EcpHost
}): Promise<EcpHost | undefined> {
  let missing = findMissingPlugins(options.requirements, options.config)
  if (missing.length === 0) return options.host
  if (!options.install || options.json || (!wantsYes(options.argv) && (!process.stdin.isTTY || !process.stdout.isTTY))) {
    throwMissing(missing)
  }
  let host = options.host
  for (const row of missing) {
    const spec = row.range ? `${row.package}@${row.range}` : row.package
    const ok = await confirmDefaultYes(`Install ${spec}?`, options.argv)
    if (!ok) throwMissing([row])
    await options.config.runCommand("plugins:install", [spec])
  }
  host = await rebuildProcessHost(options.config, host)
  missing = findMissingPlugins(options.requirements, options.config)
  if (missing.length > 0) throwMissing(missing)
  return host
}
