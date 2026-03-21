/**
 * URI scheme prefix for default secret ref `id` values and OS keyring targets (`prefix` + normalized key).
 * Provider ids are not part of this URI; they live on the ref `provider` field / binding `source`.
 *
 * @category Secrets
 */
export const ECP_SECRET_REF_PROTOCOL_PREFIX = "ecp://";

/**
 * Windows `CredEnumerateW` filter so credentials whose TargetName starts with
 * {@link ECP_SECRET_REF_PROTOCOL_PREFIX} are enumerated. The keyring default `*.{service}` filter
 * omits `ecp://…` targets.
 *
 * @category Secrets
 */
export const ECP_SECRET_REF_WIN32_ENUM_FILTER = `${ECP_SECRET_REF_PROTOCOL_PREFIX}*`;

/**
 * Service name for OS credential stores (macOS Keychain, Windows Credential Manager, etc.).
 * Entries are created with `Entry.withTarget(ECP_SECRET_REF_PROTOCOL_PREFIX + key, ECP_KEYRING_SERVICE, key)` so Windows
 * does not synthesize a `username.service` target like `ecp.KEY.ecp`.
 *
 * @category Secrets
 */
export const ECP_KEYRING_SERVICE = "ecp";

/**
 * Legacy dotted prefix for `normalizeOsKeychainAccountKey` (not the Windows/macOS storage target).
 *
 * @category Secrets
 */
export const ECP_KEYRING_ACCOUNT_PREFIX = "ecp.";
