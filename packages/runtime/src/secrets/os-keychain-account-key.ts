/**
 * OS keychain / Credential Manager naming helpers.
 *
 * @category Secrets
 */

import { ECP_KEYRING_ACCOUNT_PREFIX } from "./constants.js";
import { canonicalSecretKeyForBinding, secretRefIdFromLogicalKey } from "./ref.js";

/**
 * Canonical logical key string for OS storage (trim, backslashes → `/`).
 * Same rules as {@link canonicalSecretKeyForBinding}.
 */
export function canonicalSecretKeyForOsStorage(key: string): string {
  return canonicalSecretKeyForBinding(key);
}

/**
 * Windows/macOS keyring **target** for `os.secrets`: `ecp://` + key (no provider segment).
 * Passed to `Entry.withTarget` from `@napi-rs/keyring` so Windows does not build the default
 * `username.service` target (which produced `ecp.KEY.ecp` when both contained `ecp`).
 */
export function osKeychainCredentialTarget(logicalKey: string): string {
  return secretRefIdFromLogicalKey(logicalKey);
}

/**
 * Map a config/CLI secret key to a **dotted** `ecp.*` name (legacy / display helpers only).
 * Physical storage for `OsKeychainSecretProvider` uses {@link osKeychainCredentialTarget}.
 *
 * - Legacy path-style `ecp/foo/bar` becomes `ecp.foo.bar`
 * - `/` is normalized to `.`
 * - Ensures a leading {@link ECP_KEYRING_ACCOUNT_PREFIX} (`ecp.`)
 */
export function normalizeOsKeychainAccountKey(key: string): string {
  let k = key.trim().replace(/\\/g, "/");
  if (k.startsWith("ecp/")) {
    k = k.slice(4);
  }
  k = k.replace(/\//g, ".");
  if (!k.startsWith(ECP_KEYRING_ACCOUNT_PREFIX)) {
    k = `${ECP_KEYRING_ACCOUNT_PREFIX}${k}`;
  }
  return k;
}
