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
import {
  ECP_KEYRING_SERVICE,
  ECP_SECRET_REF_PROTOCOL_PREFIX,
  ECP_SECRET_REF_WIN32_ENUM_FILTER,
} from "../constants.js";
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
   * Accepts {@link ECP_SECRET_REF_PROTOCOL_PREFIX} URIs (key-only path), legacy `{prefix}{provider}/…`, or a bare username.
   */
  private listAccountToSecretRef(account: string): SecretRef {
    if (account.startsWith(ECP_SECRET_REF_PROTOCOL_PREFIX)) {
      const rest = account.slice(ECP_SECRET_REF_PROTOCOL_PREFIX.length);
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
      // Windows: findCredentials defaults to `*.{service}` when `target` is omitted. We store with
      // `Entry.withTarget(ECP_SECRET_REF_PROTOCOL_PREFIX + key, …)`, so TargetName does not match `*.ecp`.
      // Pass `ECP_SECRET_REF_WIN32_ENUM_FILTER` so those entries are enumerated.
      const creds =
        process.platform === "win32"
          ? findCredentials(ECP_KEYRING_SERVICE, ECP_SECRET_REF_WIN32_ENUM_FILTER)
          : findCredentials(ECP_KEYRING_SERVICE);
      return creds.map((c) => this.listAccountToSecretRef(c.account));
    } catch {
      return [];
    }
  }
}
