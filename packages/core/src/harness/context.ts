import type { CapabilityId, HarnessId } from "@executioncontrolprotocol/types"
import type { z } from "zod"
import type { Environment } from "../environment/environment.js"
import type { Ecp } from "../environment/ecp.js"
import type { CapabilityContext } from "../runtime/context.js"

/** Context passed to harness handlers during evaluate. @category Harness */
export interface HarnessCapabilityContext<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Harness id. */
  harnessId: HarnessId
  /** Resolved provider capability id. */
  uses: CapabilityId
  /** Merged harness config from environment binding (parsed when configSchema is set). */
  config: TConfig
  /** Underlying capability context for nested calls. */
  capabilityContext: CapabilityContext
  /** Environment host. */
  environment: Environment
  /** Operational ECP facade. */
  ecp: Ecp
  /** Call another capability. */
  call: CapabilityContext["capabilities"]["call"]
}

/**
 * Build harness context for evaluate invocation.
 * @category Harness
 */
export function createHarnessCapabilityContext<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
>(
  harnessId: HarnessId,
  uses: CapabilityId,
  config: Record<string, unknown>,
  env: Environment,
  ecp: Ecp,
  capabilityContext: CapabilityContext,
  configSchema?: z.ZodType<TConfig>
): HarnessCapabilityContext<TConfig> {
  const resolvedConfig = configSchema
    ? (configSchema.parse(config) as TConfig)
    : (config as TConfig)

  return {
    harnessId,
    uses,
    config: resolvedConfig,
    capabilityContext,
    environment: env,
    ecp,
    call: capabilityContext.capabilities.call.bind(capabilityContext.capabilities),
  }
}
