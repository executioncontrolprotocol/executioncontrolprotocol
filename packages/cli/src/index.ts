/**
 * ECP CLI package.
 * @category CLI
 */
export { VERSION } from "./version.js"
export { ecpHome, ecpDataDir, ensureHomeLayout } from "./lib/home.js"
export { discoverOps, ensureWarmHost, startSupervisorDetached } from "./lib/host-discovery.js"
export type { OpsHandle } from "./lib/host-discovery.js"
