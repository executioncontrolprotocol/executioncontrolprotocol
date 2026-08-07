import {
  ECP_KEYRING_SERVICE,
  ECP_SECRET_REF_PROTOCOL_PREFIX,
  ECP_SECRET_REF_WIN32_ENUM_FILTER,
} from "./constants.js"
import {
  canonicalSecretKeyForOsStorage,
  osKeychainCredentialTarget,
} from "./os-keychain-account-key.js"
import { canonicalSecretKey, secretRefIdFromLogicalKey } from "./ref.js"
import type { SecretsStore } from "./store.js"

/** OS keychain / credential manager store. @category Secrets */
export class OsKeychainSecretsStore implements SecretsStore {
  async isAvailable(): Promise<boolean> {
    try {
      const { Entry } = await import("@napi-rs/keyring")
      const entry = new Entry(ECP_KEYRING_SERVICE, "__ecp_availability_probe__")
      try {
        entry.getPassword()
      } catch {
        // NoEntry is expected
      }
      return true
    } catch {
      return false
    }
  }

  private entryForLogicalKey(
    logicalKey: string,
    Entry: typeof import("@napi-rs/keyring").Entry
  ): InstanceType<typeof import("@napi-rs/keyring").Entry> {
    const user = canonicalSecretKeyForOsStorage(logicalKey)
    const target = osKeychainCredentialTarget(logicalKey)
    return Entry.withTarget(target, ECP_KEYRING_SERVICE, user)
  }

  private listAccountToKey(account: string): string {
    if (account.startsWith(ECP_SECRET_REF_PROTOCOL_PREFIX)) {
      const rest = account.slice(ECP_SECRET_REF_PROTOCOL_PREFIX.length)
      const legacy = "os.secrets/"
      if (rest.startsWith(legacy)) {
        return canonicalSecretKey(rest.slice(legacy.length))
      }
      return canonicalSecretKey(rest)
    }
    return canonicalSecretKeyForOsStorage(account)
  }

  async set(key: string, value: string): Promise<void> {
    const { Entry } = await import("@napi-rs/keyring")
    const entry = this.entryForLogicalKey(key, Entry)
    entry.setPassword(value)
  }

  async get(key: string): Promise<string | undefined> {
    try {
      const { Entry } = await import("@napi-rs/keyring")
      const entry = this.entryForLogicalKey(key, Entry)
      const password = entry.getPassword()
      if (password == null || password === "") return undefined
      return password
    } catch {
      return undefined
    }
  }

  async delete(key: string): Promise<void> {
    const { Entry } = await import("@napi-rs/keyring")
    const entry = this.entryForLogicalKey(key, Entry)
    try {
      entry.deletePassword()
    } catch {
      // ignore missing
    }
  }

  async list(): Promise<string[]> {
    try {
      const { findCredentials } = await import("@napi-rs/keyring")
      const creds =
        process.platform === "win32"
          ? findCredentials(ECP_KEYRING_SERVICE, ECP_SECRET_REF_WIN32_ENUM_FILTER)
          : findCredentials(ECP_KEYRING_SERVICE)
      return creds.map((c) => this.listAccountToKey(c.account))
    } catch {
      return []
    }
  }
}

let osStore: OsKeychainSecretsStore | undefined

/** Shared OS keychain store for CLI and default runtime resolution. @category Secrets */
export function createOsSecretsStore(): OsKeychainSecretsStore {
  if (!osStore) osStore = new OsKeychainSecretsStore()
  return osStore
}

/** Ref id for a logical key (CLI display). @category Secrets */
export function secretRefId(key: string): string {
  return secretRefIdFromLogicalKey(key)
}
