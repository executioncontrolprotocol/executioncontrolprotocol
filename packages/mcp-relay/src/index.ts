/**
 * ECP MCP relay: three tools over stdio that forward to the local host API.
 * @category MCP
 */
export { VERSION } from "./version.js"
export { startRelay } from "./start-relay.js"
export type { StartRelayOptions } from "./start-relay.js"
export {
  RETRIEVE_DESCRIPTION,
  EXECUTE_DESCRIPTION,
  COMMIT_DESCRIPTION,
} from "./descriptions.js"
export {
  retrieveInputSchema,
  executeInputSchema,
  commitInputSchema,
  asToolInputSchema,
} from "./schemas.js"
export { formatEnvelope, formatError, formatData } from "./format.js"
export { resolveAgainst, resolveExecutePaths, resolveRetrievePaths } from "./paths.js"
export { isConnectionError } from "./forward.js"
export { ensureHost, waitForHealthyHost } from "./host.js"
