/**
 * Public API of `@executioncontrolprotocol/app`: the graph encoder, run-status mapping,
 * run form generation and the host API client. The web bundle is built to `dist/web`.
 * @category App
 */
export * from "./graph/index.js"
export * from "./form/run-input-fields.js"
export * from "./client/index.js"

/**
 * Package version.
 * @category App
 */
export const VERSION = "2.0.0"
