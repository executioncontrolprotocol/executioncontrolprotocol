export { defineExtension } from "./extension.js"
export { defineEnvironment, registerEnvironmentDefinition, getEnvironmentDefinition } from "./environment.js"
export { definePolicy } from "./policy.js"
export { capability, capabilityFor } from "./capability.js"
export { hook } from "./hook.js"
export type {
  CapabilityDefinition,
  ExtensionDefinition,
  EnvironmentDefinition,
  PolicyDefinition,
  HookDefinition,
  CapabilityHandler,
  HookHandler,
  SupportedEnvironment,
} from "./types.js"
