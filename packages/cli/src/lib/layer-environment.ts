import { access } from "node:fs/promises"
import { join } from "node:path"
import type { Interfaces } from "@oclif/core"
import {
  PROCESS_ENV_RESOLVER_ID,
  SECRETS_RESOLVER_ID,
  extension,
  type Ecp,
  type Environment,
  type Registry,
  type WorkflowBinding,
} from "@executioncontrolprotocol/core"
import { ECP_BINDING_INVALID, EcpError } from "@executioncontrolprotocol/core/types"
import { journalExtension, loadEnvironmentModule } from "@executioncontrolprotocol/node"
import type { EcpHost } from "@executioncontrolprotocol/plugin-sdk"
import { setHost } from "@executioncontrolprotocol/plugin-sdk"
import { createProcessEnvironment } from "./plugin-bindings.js"
import { ecpFromEnvFlag, terminateIfNeeded } from "./load-ecp.js"

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
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
 * User default environment file in the oclif config directory.
 * @category CLI
 */
export async function userEnvironmentFile(configDir: string): Promise<string | undefined> {
  for (const name of ["environment.ecp.ts", "environment.ecp.js", "environment.ts"]) {
    const candidate = join(configDir, name)
    if (await pathExists(candidate)) return candidate
  }
  return undefined
}

function isDefinitionBinding(binding: WorkflowBinding): boolean {
  const ref = binding.getRef()
  return typeof ref === "object" && ref !== null
}

/**
 * Layer built-in Node + installed plugins, optional `--env` / user environment, then
 * workflow `.with()` **definition objects**. String-id bindings record requirements only;
 * the process host (or `--env`) must already provide those extensions.
 * @category CLI
 */
export async function layerRunEnvironment(options: {
  envFlag?: string
  workflowBindings?: WorkflowBinding[]
  config: Interfaces.Config
  host?: EcpHost
}): Promise<{ ecp: Ecp; terminate: boolean }> {
  const bindings = options.workflowBindings ?? []
  const definitionBindings = bindings.filter(isDefinitionBinding)
  const envFile =
    options.envFlag ??
    (options.config.configDir ? await userEnvironmentFile(options.config.configDir) : undefined)

  if (bindings.length > 0) {
    assertWorkflowBindingsAllowed(bindings, options.host?.registry)
  }

  if (!envFile && definitionBindings.length === 0) {
    return ecpFromEnvFlag(undefined, options.host)
  }

  let env: Environment
  if (envFile) {
    env = await loadEnvironmentModule(envFile)
  } else {
    env = await createProcessEnvironment(options.config)
  }

  env.with([extension(journalExtension)])

  if (definitionBindings.length > 0) {
    env.with(definitionBindings)
  }

  const ecp = await env.init()
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
  const env = await createProcessEnvironment(config)
  const ecp = await env.init()
  const host: EcpHost = {
    ecp,
    registry: ecp.getRegistry(),
    environmentId: ecp.id,
    output: previous?.output ?? "pretty",
  }
  if (previous) setHost(host)
  return host
}

export { terminateIfNeeded }
