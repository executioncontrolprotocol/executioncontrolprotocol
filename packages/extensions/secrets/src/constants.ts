/**
 * URI scheme prefix for OS keyring targets and default ref ids.
 * @category Secrets
 */
export const ECP_SECRET_REF_PROTOCOL_PREFIX = "ecp://"

/**
 * Windows `CredEnumerateW` filter for `ecp://` targets.
 * @category Secrets
 */
export const ECP_SECRET_REF_WIN32_ENUM_FILTER = `${ECP_SECRET_REF_PROTOCOL_PREFIX}*`

/**
 * Service name for OS credential stores.
 * @category Secrets
 */
export const ECP_KEYRING_SERVICE = "ecp"

/**
 * Legacy dotted prefix for display helpers only.
 * @category Secrets
 */
export const ECP_KEYRING_ACCOUNT_PREFIX = "ecp."
