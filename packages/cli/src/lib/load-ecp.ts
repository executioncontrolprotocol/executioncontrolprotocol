import { loadEnvironmentModule } from "@executioncontrolprotocol/node"
import type { Ecp } from "@executioncontrolprotocol/core"
import { getHost, type EcpHost } from "@executioncontrolprotocol/plugin-sdk"

/**
 * Resolve an operational Ecp: `--env` module when provided, otherwise the process host.
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
  const resolved = host ?? getHost()
  return { ecp: resolved.ecp, terminate: false }
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
