/**
 * Local ECP host composition, HTTP API and client helpers.
 * @category Host
 */
export { VERSION } from "./version.js"
export { createLocalHost } from "./create-local-host.js"
export type { CreateLocalHostOptions, LocalHost, LocalHostTiming } from "./create-local-host.js"
export { LocalTokenAuth, tokensEqual, isAllowedHost, isAllowedOrigin } from "./auth/local-token-auth.js"
export type { LocalTokenAuthOptions } from "./auth/local-token-auth.js"
export { HttpApiEndpoint } from "./http/http-api-endpoint.js"
export type { HttpApiEndpointOptions } from "./http/http-api-endpoint.js"
export { generateHostToken } from "./token.js"
export { readHostJson } from "./client/read-host-json.js"
export { checkHealth, hostHeaderFor } from "./client/check-health.js"
export type { HostHealth } from "./client/check-health.js"
export { HostClient } from "./client/host-client.js"
export { runSupervisor } from "./supervisor.js"
export type { SupervisorOptions } from "./supervisor.js"
export { allocateLoopbackPort } from "./ports.js"
export { main as runHostMain } from "./main.js"
