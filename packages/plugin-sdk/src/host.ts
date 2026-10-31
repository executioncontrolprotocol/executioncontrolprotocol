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

interface GlobalWithHost {
  [ECP_HOST_SYMBOL]?: EcpHost
}

/**
 * Store the process-wide CLI host. Called from the CLI `init` hook.
 * @category CLI
 */
export function setHost(host: EcpHost): void {
  ;(globalThis as GlobalWithHost)[ECP_HOST_SYMBOL] = host
}

/**
 * Clear the process-wide CLI host (tests).
 * @category CLI
 */
export function clearHost(): void {
  delete (globalThis as GlobalWithHost)[ECP_HOST_SYMBOL]
}

/**
 * Read the process-wide CLI host created by the `init` hook.
 * `config` is accepted for call-site compatibility; the host is process-wide.
 * @category CLI
 */
export function getHost(_config?: Interfaces.Config): EcpHost {
  const host = (globalThis as GlobalWithHost)[ECP_HOST_SYMBOL]
  if (!host) {
    throw new Error("ECP host is not initialized. The CLI init hook must run first.")
  }
  return host
}
