import {
  ECP_WORKFLOW_LOAD,
  LATEST_ECP_VERSION,
  isEcpError,
  type ValidationResult,
} from "@executioncontrolprotocol/core/types"

/**
 * Turn a loader/compile failure into `ECP_WORKFLOW_LOAD` diagnostics for the UI.
 * @category App
 */
export function workflowLoadError(err: unknown): ValidationResult {
  const code = isEcpError(err) ? err.code : ECP_WORKFLOW_LOAD
  const message = err instanceof Error ? err.message : String(err)
  return {
    schema: "@executioncontrolprotocol.validation.result",
    version: LATEST_ECP_VERSION,
    valid: false,
    errors: [
      {
        code,
        message,
        ...(isEcpError(err) && err.path ? { path: err.path } : {}),
        ...(isEcpError(err) && err.suggestions ? { suggestions: err.suggestions } : {}),
      },
    ],
    warnings: [],
  }
}
