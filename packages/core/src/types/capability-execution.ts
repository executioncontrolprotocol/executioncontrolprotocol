/** Where a capability may execute. @category Capabilities */
export const CAPABILITY_EXECUTION = ["local", "host", "mixed"] as const

/** Capability execution kind. @category Capabilities */
export type CapabilityExecution = (typeof CAPABILITY_EXECUTION)[number]
