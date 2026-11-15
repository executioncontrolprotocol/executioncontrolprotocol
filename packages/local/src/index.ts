/**
 * Local host services: plugin registration (Phase 2), storage and secrets (later).
 * @category Services
 */
export { VERSION } from "./version.js"
export { LocalPluginRegistration } from "./plugins/registration.js"
export type { LocalPluginRegistrationOptions } from "./plugins/registration.js"
export { discoverPluginRoots } from "./plugins/discover.js"
export type { DiscoveredPlugin } from "./plugins/discover.js"
export { loadPluginPackage } from "./plugins/load-manifest.js"
export type { LoadedPluginPackage } from "./plugins/load-manifest.js"
export { createPluginFiles } from "./plugins/files.js"
export { validateCapabilityInput } from "./plugins/validate-input.js"
