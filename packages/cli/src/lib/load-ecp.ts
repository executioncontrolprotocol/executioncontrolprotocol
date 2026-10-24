import { environment, loadEnvironmentModule, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import type { Ecp } from "@executioncontrolprotocol/core"
import { getHost, type EcpHost } from "@executioncontrolprotocol/plugin-sdk"

/**
 * Resolve an operational Ecp: `--env` module when provided, otherwise the process host.
 * When the init hook has not run (in-process tests), fall back to a fresh Node environment.
 * @category CLI
 */
export async function ecpFromEnvFlag(
  envPath: string | undefined,
  host?: EcpHost
): Promise<{ ecp: Ecp; terminate: boolean }> {
  if (envPath) {
    const env = await loadEnvironmentModule(envPath)
    const ecp = await env.init()
    return { ecp, terminate: true }
  }
  if (host) return { ecp: host.ecp, terminate: false }
  try {
    return { ecp: getHost().ecp, terminate: false }
  } catch {
    const env = environment(NODE_ENVIRONMENT_ID, "cli")
    const ecp = await env.init()
    return { ecp, terminate: true }
  }
}

/**
 * Terminate an Ecp created for a single command (`--env`), ignoring cleanup errors.
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
