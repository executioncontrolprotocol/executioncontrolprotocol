import { resolve } from "node:path"
import type { Interfaces } from "@oclif/core"
import {
  PROCESS_ENV_RESOLVER_ID,
  SECRETS_RESOLVER_ID,
  extension,
  inferredPackageName,
  isBuiltinRequirementId,
  type Ecp,
  type Environment,
  type EnvironmentBinding,
  type Registry,
  type WorkflowBinding,
} from "@executioncontrolprotocol/core"
import {
  ECP_BINDING_INVALID,
  ECP_PLUGINS_MISSING,
  EcpError,
  type NamespacedId,
} from "@executioncontrolprotocol/core/types"
import {
  environment,
  journalExtension,
  loadConfigModule,
  NODE_ENVIRONMENT_ID,
} from "@executioncontrolprotocol/node"
import {
  getHost,
  setHost,
  throwIfHostInitFailed,
  type EcpHost,
} from "@executioncontrolprotocol/plugin-sdk"
import { existingConfigFile } from "./config-file.js"
import { createProcessEnvironment } from "./plugin-bindings.js"

function resolveBindingId(binding: EnvironmentBinding | WorkflowBinding): string {
  const ref = binding.getRef()
  if (typeof ref === "string") return ref
  if (typeof ref === "object" && ref !== null && "id" in ref) return String(ref.id)
  return String(ref)
}

function assertWorkflowBindingsAllowed(
  bindings: WorkflowBinding[],
  registry?: Registry
): void {
  for (const binding of bindings) {
    const ref = binding.getRef()
    const id = typeof ref === "string" ? ref : ref.id
    const def =
      typeof ref === "object" && ref !== null && "providesConfigResolver" in ref
        ? (ref as { providesConfigResolver?: boolean })
        : registry?.getExtension(id)
    if (
      id === SECRETS_RESOLVER_ID ||
      id === PROCESS_ENV_RESOLVER_ID ||
      def?.providesConfigResolver
    ) {
      throw new EcpError(
        ECP_BINDING_INVALID,
        `Workflow files cannot bind config resolver ${id}. Bind it on the environment instead.`
      )
    }
  }
}

/**
 * User default config file in the oclif config directory.
 * @category CLI
 */
export async function userConfigFile(configDir: string): Promise<string | undefined> {
  return existingConfigFile(configDir)
}

function isDefinitionBinding(binding: WorkflowBinding): boolean {
  const ref = binding.getRef()
  return typeof ref === "object" && ref !== null
}

/** True when a workflow binding carries config that must overlay the process host. */
function bindingHasConfig(binding: WorkflowBinding): boolean {
  return Object.keys(binding.getConfig()).length > 0
}

/**
 * Config bindings may only configure plugins already on the process host.
 * @category CLI
 */
export function assertConfigPluginsInstalled(
  env: Environment,
  bindings: EnvironmentBinding[]
): void {
  const installed = new Set(env.getBindings().map(resolveBindingId))
  const missing: { id: string; package: string; command: string }[] = []
  for (const binding of bindings) {
    const id = resolveBindingId(binding)
    if (isBuiltinRequirementId(id) || installed.has(id)) continue
    const pkg = inferredPackageName(id as NamespacedId)
    if (!pkg) {
      throw new EcpError(
        ECP_BINDING_INVALID,
        `Config binding ${id} is not an installed plugin.`,
        { suggestions: [`ecp plugins install ${id}`] }
      )
    }
    missing.push({ id, package: pkg, command: `ecp plugins install ${pkg}` })
  }
  if (missing.length === 0) return
  throw new EcpError(
    ECP_PLUGINS_MISSING,
    `Missing plugins: ${missing.map((row) => row.package).join(", ")}`,
    { suggestions: missing.map((row) => row.command), details: missing }
  )
}

/**
 * Load `--config` or the default `config.ecp.ts` and merge onto `env`.
 * Never replaces installed plugin bindings.
 * @category CLI
 */
export async function mergeConfigFile(
  env: Environment,
  options: { configFlag?: string; configDir?: string }
): Promise<void> {
  const path = options.configFlag
    ? resolve(options.configFlag)
    : options.configDir
      ? await existingConfigFile(options.configDir)
      : undefined
  if (!path) return
  const bindings = await loadConfigModule(path)
  assertConfigPluginsInstalled(env, bindings)
  env.with(bindings)
}

/**
 * Node + installed plugins, then optional machine config.
 * @category CLI
 */
export async function createConfiguredProcessEnvironment(options: {
  config: Interfaces.Config
  configFlag?: string
}): Promise<Environment> {
  const env = await createProcessEnvironment(options.config)
  await mergeConfigFile(env, {
    configFlag: options.configFlag,
    configDir: options.configFlag ? undefined : options.config.configDir,
  })
  return env
}

/**
 * Layer built-in Node + installed plugins, optional `--config` / user config, then
 * workflow `.with()` bindings. Definition objects and any binding with non-empty
 * config overlay the process host (workflow config wins on overlapping keys).
 * String-id bindings with empty config still only record requirements.
 * @category CLI
 */
export async function layerRunEnvironment(options: {
  configFlag?: string
  workflowBindings?: WorkflowBinding[]
  config: Interfaces.Config
  host?: EcpHost
}): Promise<{ ecp: Ecp; terminate: boolean }> {
  const bindings = options.workflowBindings ?? []
  const definitionBindings = bindings.filter(isDefinitionBinding)
  const configBindings = bindings.filter(bindingHasConfig)
  const needsRebuild =
    Boolean(options.configFlag) ||
    definitionBindings.length > 0 ||
    configBindings.length > 0

  if (bindings.length > 0) {
    assertWorkflowBindingsAllowed(bindings, options.host?.registry)
  }

  if (!needsRebuild) {
    if (options.host) return { ecp: options.host.ecp, terminate: false }
    throwIfHostInitFailed()
    try {
      return { ecp: getHost().ecp, terminate: false }
    } catch {
      const fallback = environment(NODE_ENVIRONMENT_ID, "cli")
      return { ecp: await fallback.init({ prepare: "discovery" }), terminate: true }
    }
  }

  const env = await createConfiguredProcessEnvironment({
    config: options.config,
    configFlag: options.configFlag,
  })
  env.with([extension(journalExtension)])
  // Overlay all workflow bindings that carry config (string ids or definitions)
  // and any definition bindings so Environment.with merges onto installed plugins.
  const overlay = [
    ...definitionBindings,
    ...configBindings.filter((b) => !isDefinitionBinding(b)),
  ]
  if (overlay.length > 0) {
    env.with(overlay)
  }
  const ecp = await env.init({ prepare: "discovery" })
  return { ecp, terminate: true }
}

/**
 * Rebuild the process host after installing plugins.
 * @category CLI
 */
export async function rebuildProcessHost(
  config: Interfaces.Config,
  previous?: EcpHost
): Promise<EcpHost> {
  if (previous) {
    try {
      await previous.ecp.terminate()
    } catch {
      /* ignore */
    }
  }
  const env = await createConfiguredProcessEnvironment({ config })
  const ecp = await env.init({ prepare: "discovery" })
  const host: EcpHost = {
    ecp,
    registry: ecp.getRegistry(),
    environmentId: ecp.id,
    output: previous?.output ?? "pretty",
  }
  if (previous) setHost(host)
  return host
}
