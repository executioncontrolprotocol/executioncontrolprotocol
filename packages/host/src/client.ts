/**
 * Lightweight host client surface for warm HTTP paths (no engine / QuickJS).
 * @category Host
 */
export { readHostJson } from "./client/read-host-json.js"
export { checkHealth, hostHeaderFor } from "./client/check-health.js"
export type { HostHealth } from "./client/check-health.js"
export { HostClient } from "./client/host-client.js"