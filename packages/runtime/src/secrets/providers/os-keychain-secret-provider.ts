/**
 * OS-native credential storage via `@napi-rs/keyring` (macOS, Windows, Linux where supported).
 *
 * @category Secrets
 */

import type {
  SecretProvider,
  SecretProviderCapabilities,
  SecretProviderHealth,
  SecretRef,
  SecretStoreInput,
  SecretValueResult,
} from "@executioncontrolprotocol/plugins";
import { ECP_KEYRING_SERVICE } from "../constants.js";
import {
  canonicalSecretKeyForOsStorage,
  osKeychainCredentialTarget,
} from "../os-keychain-account-key.js";
import { OS_PROVIDER_ID } from "../provider-ids.js";
import { canonicalSecretKeyForBinding, secretRefIdFromLogicalKey } from "../ref.js";
import { redactSecret } from "../redaction.js";

export class OsKeychainSecretProvider implements SecretProvider {
  readonly id = OS_PROVIDER_ID;
  readonly displayName = "OS keychain / credential manager";

  async isAvailable(): Promise<boolean> {
    try {
      const { Entry } = await import("@napi-rs/keyring");
      const entry = new Entry(ECP_KEYRING_SERVICE, "__ecp_availability_probe__");
      try {
        entry.getPassword();
      } catch {
        // NoEntry is expected
      }
      return true;
    } catch {
      return false;
    }
  }

  capabilities(): SecretProviderCapabilities {
    return {
      secureAtRest: true,
      interactiveUnlock: true,
      headlessSupported: true,
      persistent: true,
      supportsList: true,
      supportsDelete: true,
      supportsMetadata: false,
    };
  }

  async healthCheck(): Promise<SecretProviderHealth> {
    const ok = await this.isAvailable();
    return {
      ok,
      providerId: this.id,
      message: ok ? undefined : "Keyring native module unavailable on this platform",
    };
  }

  private entryForLogicalKey(
    logicalKey: string,
    Entry: typeof import("@napi-rs/keyring").Entry,
  ): InstanceType<typeof import("@napi-rs/keyring").Entry> {
    const user = canonicalSecretKeyForOsStorage(logicalKey);
    const target = osKeychainCredentialTarget(logicalKey);
    return Entry.withTarget(target, ECP_KEYRING_SERVICE, user);
  }

  /**
   * Map OS `findCredentials` account string to a binding key + ref id.
   * Accepts `ecp://<key>`, legacy `ecp://<provider>/<key>` (e.g. older `os.secrets/...`), or a bare username.
   */
  private listAccountToSecretRef(account: string): SecretRef {
    const scheme = "ecp://";
    if (account.startsWith(scheme)) {
      const rest = account.slice(scheme.length);
      const legacy = `${this.id}/`;
      if (rest.startsWith(legacy)) {
        const key = rest.slice(legacy.length);
        return {
          id: secretRefIdFromLogicalKey(key),
          provider: this.id,
          key: canonicalSecretKeyForBinding(key),
        };
      }
      const key = canonicalSecretKeyForBinding(rest);
      return { id: secretRefIdFromLogicalKey(key), provider: this.id, key };
    }
    const key = canonicalSecretKeyForOsStorage(account);
    return {
      id: secretRefIdFromLogicalKey(key),
      provider: this.id,
      key,
    };
  }

  async store(input: SecretStoreInput): Promise<void> {
    const { Entry } = await import("@napi-rs/keyring");
    const entry = this.entryForLogicalKey(input.ref.key, Entry);
    entry.setPassword(input.value);
  }

  async load(ref: SecretRef): Promise<SecretValueResult | null> {
    try {
      const { Entry } = await import("@napi-rs/keyring");
      const entry = this.entryForLogicalKey(ref.key, Entry);
      const password = entry.getPassword();
      if (password == null || password === "") return null;
      return { value: password, redactedPreview: redactSecret(password) };
    } catch {
      return null;
    }
  }

  async delete(ref: SecretRef): Promise<void> {
    const { Entry } = await import("@napi-rs/keyring");
    const entry = this.entryForLogicalKey(ref.key, Entry);
    try {
      entry.deletePassword();
    } catch {
      // ignore missing
    }
  }

  async list(): Promise<SecretRef[]> {
    try {
      const { findCredentials } = await import("@napi-rs/keyring");
      // Windows: @napi-rs/keyring / keyring-rs uses filter `*.{service}` (e.g. `*.ecp`) when `target`
      // is omitted. That only matches Credential Manager TargetNames ending in `.ecp`. We store with
      // `Entry.withTarget("ecp://<key>", …)`, so TargetName does not match `*.ecp` and enumerate
      // returns nothing. Pass an explicit prefix filter so `ecp://…` entries are included.
      const creds =
        process.platform === "win32"
          ? findCredentials(ECP_KEYRING_SERVICE, "ecp://*")
          : findCredentials(ECP_KEYRING_SERVICE);
      return creds.map((c) => this.listAccountToSecretRef(c.account));
    } catch {
      return [];
    }
  }
}
