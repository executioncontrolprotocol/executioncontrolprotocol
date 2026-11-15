import type { ServiceContext } from "@executioncontrolprotocol/engine"
import { IMPLEMENTATION_IDS, SECRET_KEY_PATTERN, type SecretsProvider } from "@executioncontrolprotocol/protocol"

const KEY_RE = new RegExp(SECRET_KEY_PATTERN)
const ECP_KEYRING_SERVICE = "ecp"

/**
 * OS keychain + `ECP_SECRET_*` env fallback.
 * @category Secrets
 */
export class LocalSecrets implements SecretsProvider {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.localSecrets

  private keychainAvailable: boolean | undefined

  /**
   * @param _ctx Service context (home unused; secrets are global to the machine/env).
   */
  constructor(_ctx: ServiceContext) {}

  /** Resolve one key. Non-empty keychain values beat env. */
  async get(key: string): Promise<string | undefined> {
    assertValidKey(key)
    const fromKeychain = await this.getKeychain(key)
    const fromEnv = process.env[envNameForKey(key)]
    if (fromKeychain) return fromKeychain
    if (fromEnv !== undefined) return fromEnv
    return undefined
  }

  /** Set one key in the keychain. */
  async set(key: string, value: string): Promise<void> {
    assertValidKey(key)
    const { Entry } = await import("@napi-rs/keyring")
    new Entry(ECP_KEYRING_SERVICE, canonicalSecretKey(key)).setPassword(value)
    this.keychainAvailable = true
  }

  /** Delete one key from the keychain (env is not mutated). */
  async delete(key: string): Promise<boolean> {
    assertValidKey(key)
    const existed = Boolean(await this.getKeychain(key))
    try {
      const { Entry } = await import("@napi-rs/keyring")
      new Entry(ECP_KEYRING_SERVICE, canonicalSecretKey(key)).deletePassword()
    } catch {
      // missing is fine
    }
    return existed
  }

  /** Key names from keychain and matching env vars, sorted unique. */
  async list(): Promise<string[]> {
    const keys = new Set<string>(await this.listKeychain())
    for (const [name, value] of Object.entries(process.env)) {
      if (!name.startsWith("ECP_SECRET_") || value === undefined) continue
      const logical = name.slice("ECP_SECRET_".length)
      if (KEY_RE.test(logical)) keys.add(logical)
    }
    return [...keys].sort()
  }

  /** Whether the OS keychain is usable (for tests that skip). */
  async isKeychainAvailable(): Promise<boolean> {
    if (this.keychainAvailable !== undefined) return this.keychainAvailable
    try {
      const { Entry } = await import("@napi-rs/keyring")
      const entry = new Entry(ECP_KEYRING_SERVICE, "__ecp_availability_probe__")
      try {
        entry.getPassword()
      } catch {
        // NoEntry expected
      }
      this.keychainAvailable = true
    } catch {
      this.keychainAvailable = false
    }
    return this.keychainAvailable
  }

  private async getKeychain(key: string): Promise<string | undefined> {
    try {
      const { Entry } = await import("@napi-rs/keyring")
      const password = new Entry(ECP_KEYRING_SERVICE, canonicalSecretKey(key)).getPassword()
      return password ? password : undefined
    } catch {
      return undefined
    }
  }

  private async listKeychain(): Promise<string[]> {
    try {
      const { findCredentials } = await import("@napi-rs/keyring")
      return [...new Set(findCredentials(ECP_KEYRING_SERVICE).map((cred) => canonicalSecretKey(cred.account)))].sort()
    } catch {
      return []
    }
  }
}

/**
 * Env var name for a secret key (`anthropic.apiKey` → `ECP_SECRET_ANTHROPIC_APIKEY`).
 * @category Secrets
 */
export function envNameForKey(key: string): string {
  return `ECP_SECRET_${canonicalSecretKey(key).toUpperCase().replace(/[^A-Z0-9]/g, "_")}`
}

/**
 * Trim and normalize separators.
 * @category Secrets
 */
export function canonicalSecretKey(key: string): string {
  return key.trim().replace(/\\/g, "/")
}

function assertValidKey(key: string): void {
  if (!KEY_RE.test(canonicalSecretKey(key))) {
    throw Object.assign(new Error(`ECP_REQUEST_INVALID: secret key ${key} is invalid.`), {
      code: "ECP_REQUEST_INVALID",
    })
  }
}
