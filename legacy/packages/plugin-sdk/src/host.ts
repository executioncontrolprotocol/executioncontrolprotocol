import type { Interfaces } from "@oclif/core"
import type { Ecp, Registry } from "@executioncontrolprotocol/core"
import type { ValidationIssue } from "@executioncontrolprotocol/core/types"

/** How the CLI should print command results. @category CLI */
export type OutputMode = "json" | "pretty"

/**
 * Per-process CLI host: the Node environment, its registry, and output mode.
 * Stored on `globalThis` under {@link ECP_HOST_SYMBOL}.
 * @category CLI
 */
export interface EcpHost {
  /** Operational instance after `environment().init()`. */
  ecp: Ecp
  /** Registry owned by this host. */
  registry: Registry
  /** Environment definition id (the Node host). */
  environmentId: string
  /** Preferred output mode for this process. */
  output: OutputMode
  /** Optional journal writer for generated capability commands. */
  recordInvoke?: (entry: {
    capabilityId: string
    input: unknown
    result: unknown
    success: boolean
    diagnostics?: ValidationIssue[]
  }) => Promise<string | void>
  /**
   * Re-init the environment from currently installed plugins.
   * The CLI `init` hook sets this so MCP can rebuild after `plugins install`
   * without importing `@executioncontrolprotocol/cli`.
   */
  rebuild?: () => Promise<EcpHost>
}

/** `globalThis` key for the CLI host. @category CLI */
export const ECP_HOST_SYMBOL = Symbol.for("ecp.host")

/** `globalThis` key for a failed CLI host init (rethrown by commands). @category CLI */
export const ECP_HOST_INIT_ERROR_SYMBOL = Symbol.for("ecp.hostInitError")

interface GlobalWithHost {
  [ECP_HOST_SYMBOL]?: EcpHost
  [ECP_HOST_INIT_ERROR_SYMBOL]?: unknown
}

/**
 * Store the process-wide CLI host. Called from the CLI `init` hook.
 * Clears any prior host-init error.
 * @category CLI
 */
export function setHost(host: EcpHost): void {
  const g = globalThis as GlobalWithHost
  g[ECP_HOST_SYMBOL] = host
  delete g[ECP_HOST_INIT_ERROR_SYMBOL]
}

/**
 * Record that the CLI init hook failed to build the host.
 * Commands rethrow this instead of silently using a bare Node environment.
 * @category CLI
 */
export function setHostInitError(error: unknown): void {
  const g = globalThis as GlobalWithHost
  g[ECP_HOST_INIT_ERROR_SYMBOL] = error
  delete g[ECP_HOST_SYMBOL]
}

/**
 * Clear the process-wide CLI host (tests).
 * @category CLI
 */
export function clearHost(): void {
  const g = globalThis as GlobalWithHost
  delete g[ECP_HOST_SYMBOL]
  delete g[ECP_HOST_INIT_ERROR_SYMBOL]
}

/**
 * Rethrow a stored host-init error when the hook ran but failed.
 * @category CLI
 */
export function throwIfHostInitFailed(): void {
  const error = (globalThis as GlobalWithHost)[ECP_HOST_INIT_ERROR_SYMBOL]
  if (error !== undefined) throw error
}

/**
 * Read the process-wide CLI host created by the `init` hook.
 * `config` is accepted for call-site compatibility; the host is process-wide.
 * @category CLI
 */
export function getHost(_config?: Interfaces.Config): EcpHost {
  throwIfHostInitFailed()
  const host = (globalThis as GlobalWithHost)[ECP_HOST_SYMBOL]
  if (!host) {
    throw new Error("ECP host is not initialized. The CLI init hook must run first.")
  }
  return host
}
