/**
 * Service name for OS credential stores (macOS Keychain, Windows Credential Manager, etc.).
 * Entries are created with `Entry.withTarget(ecp://<key>, ECP_KEYRING_SERVICE, <key>)` so Windows
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
