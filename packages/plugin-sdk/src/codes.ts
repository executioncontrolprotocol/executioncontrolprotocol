export {
  ECP_BINDING_INVALID,
  ECP_CAPABILITY_UNKNOWN,
  ECP_ENVIRONMENT_UNSUPPORTED,
  ECP_INPUT_INVALID,
  ECP_PLUGIN_DENIED,
  ECP_PLUGINS_MISSING,
  ECP_POLICY_DENIED,
  ECP_RUN_PAUSED,
  ECP_SECRET_MISSING,
  ECP_STEP_FAILED,
  ECP_WORKFLOW_LOAD,
} from "@executioncontrolprotocol/core/types"

/** Process exit code for success. @category CLI */
export const EXIT_OK = 0

/** Process exit code when a capability or run failed. @category CLI */
export const EXIT_FAILED = 1

/** Process exit code for invalid input or usage. @category CLI */
export const EXIT_USAGE = 2

/** Process exit code when a required plugin is missing. @category CLI */
export const EXIT_PLUGINS_MISSING = 3

/** Process exit code when a policy paused execution. @category CLI */
export const EXIT_PAUSED = 4
