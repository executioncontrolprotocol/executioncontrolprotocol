/** localStorage key for vault KDF salt. @category BrowserSecrets */
export const VAULT_SALT_KEY = "ecp:browser-secrets:v1:salt"

/** localStorage key for passphrase verifier. @category BrowserSecrets */
export const VAULT_VERIFIER_KEY = "ecp:browser-secrets:v1:verifier"

/** Prefix for encrypted secret entries in localStorage. @category BrowserSecrets */
export const SECRET_STORAGE_PREFIX = "ecp:browser-secret:"

/** localStorage index of secret key names. @category BrowserSecrets */
export const SECRET_INDEX_KEY = "ecp:browser-secrets:v1:index"

/** PBKDF2 iteration count for passphrase derivation. @category BrowserSecrets */
export const PBKDF2_ITERATIONS = 310_000

/** Verifier plaintext constant. @category BrowserSecrets */
export const VAULT_VERIFIER_PLAINTEXT = "ecp-browser-secrets-v1"
