import type { Interfaces } from "@oclif/core"
import type { RequirementsDocument } from "@executioncontrolprotocol/core"
import { loadEnvironmentModule } from "@executioncontrolprotocol/node"
import {
  ECP_PLUGINS_MISSING,
  EcpCliError,
  EXIT_PLUGINS_MISSING,
  type EcpHost,
} from "@executioncontrolprotocol/plugin-sdk"
import { confirmDefaultYes, wantsYes } from "./confirm.js"
import { rebuildProcessHost } from "./layer-environment.js"
import { findMissingPlugins, type MissingPlugin } from "./missing-plugins.js"

/**
 * Drop requirements already bound on the process host or an `--env` overlay.
 * String-id workflow `.with()` does not count; those still need a plugin or a
 * definition-object binding.
 * @category CLI
 */
async function skipSatisfiedPlugins(
  missing: MissingPlugin[],
  host?: EcpHost,
  envFlag?: string
): Promise<MissingPlugin[]> {
  const remaining = missing.filter((row) => !host?.registry.getExtension(row.id))
  if (!envFlag || remaining.length === 0) return remaining
  const env = await loadEnvironmentModule(envFlag)
  const compiled = env.compile()
  const provided = new Set([
    ...(compiled.extensions ?? []).map((ext) => ext.id),
    ...(compiled.policies ?? []).map((policy) => policy.id),
  ])
  return remaining.filter((row) => !provided.has(row.id))
}

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
  /** Optional `--env` overlay; definition-object bindings skip npm install. */
  envFlag?: string
}): Promise<EcpHost | undefined> {
  let missing = await skipSatisfiedPlugins(
    findMissingPlugins(options.requirements, options.config),
    options.host,
    options.envFlag
  )
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
  missing = await skipSatisfiedPlugins(
    findMissingPlugins(options.requirements, options.config),
    host,
    options.envFlag
  )
  if (missing.length > 0) throwMissing(missing)
  return host
}
