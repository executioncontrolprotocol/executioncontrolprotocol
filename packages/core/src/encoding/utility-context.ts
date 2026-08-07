import type { Registry } from "../registry/registry.js"
import type { Logger, UsageLedger } from "../runtime/context.js"
import type { StoreContext } from "../runtime/store.js"
import { createUsageLedger } from "../runtime/context.js"

/** Limited context for utility capabilities (encode/decode). @category Encoding */
export interface UtilityCapabilityContext {
  /** Environment identity. */
  environment: {
    /** Environment id. */
    id: string
    /** Optional label. */
    label?: string
  }
  /** Definition registry. */
  registry: Registry
  /** Logger instance. */
  logger: Logger
  /** Usage ledger (no-op accumulation for utilities). */
  usage: UsageLedger
  /** Unavailable store — utilities must not mutate workflow state. */
  store: StoreContext
}

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

/** Store that rejects workflow state access from utility capabilities. @category Encoding */
export function createUnavailableStoreContext(): StoreContext {
  const err = () => {
    throw new Error("Utility capabilities cannot read or mutate workflow state.")
  }
  return {
    read: async () => err(),
    set: async () => err(),
    replace: async () => err(),
    merge: async () => err(),
    append: async () => err(),
  }
}

/**
 * Build utility context for an environment encode/decode operation.
 * @category Encoding
 */
export function createUtilityCapabilityContext(
  envId: string,
  envLabel: string | undefined,
  registry: Registry
): UtilityCapabilityContext {
  return {
    environment: { id: envId, label: envLabel },
    registry,
    logger: noopLogger,
    usage: createUsageLedger(),
    store: createUnavailableStoreContext(),
  }
}
