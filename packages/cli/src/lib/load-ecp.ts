import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import type { Ecp } from "@executioncontrolprotocol/core"
import { getHost, type EcpHost } from "@executioncontrolprotocol/plugin-sdk"
import type { Interfaces } from "@oclif/core"
import { createConfiguredProcessEnvironment } from "./layer-environment.js"
import { extension } from "@executioncontrolprotocol/core"
import { journalExtension } from "@executioncontrolprotocol/node"

/**
 * Resolve an operational Ecp: `--config` merged onto the process host when provided,
 * otherwise the process host (which already includes the default config file).
 * When the init hook has not run (in-process tests), fall back to a fresh Node environment.
 * @category CLI
 */
export async function ecpFromConfigFlag(options: {
  configFlag?: string
  host?: EcpHost
  config?: Interfaces.Config
}): Promise<{ ecp: Ecp; terminate: boolean }> {
  if (options.configFlag) {
    if (!options.config) {
      throw new Error("oclif config is required when --config is set")
    }
    const env = await createConfiguredProcessEnvironment({
      config: options.config,
      configFlag: options.configFlag,
    })
    env.with([extension(journalExtension)])
    const ecp = await env.init()
    return { ecp, terminate: true }
  }
  if (options.host) return { ecp: options.host.ecp, terminate: false }
  try {
    return { ecp: getHost().ecp, terminate: false }
  } catch {
    const env = environment(NODE_ENVIRONMENT_ID, "cli")
    const ecp = await env.init()
    return { ecp, terminate: true }
  }
}

/**
 * Terminate an Ecp created for a single command (`--config`), ignoring cleanup errors.
 * @category CLI
 */
export async function terminateIfNeeded(ecp: Ecp, terminate: boolean): Promise<void> {
  if (!terminate) return
  try {
    await ecp.terminate()
  } catch {
    /* ignore */
  }
}
