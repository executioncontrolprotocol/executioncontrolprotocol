/**
 * CLI envelope error: merged input failed the capability or operation schema.
 * @category CLI
 */
export const ECP_INPUT_INVALID = "ECP_INPUT_INVALID"

/**
 * CLI envelope error: a required plugin is not installed.
 * @category CLI
 */
export const ECP_PLUGINS_MISSING = "ECP_PLUGINS_MISSING"

/**
 * CLI envelope error: the plugin trust check refused an install.
 * @category CLI
 */
export const ECP_PLUGIN_DENIED = "ECP_PLUGIN_DENIED"

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
