import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { ServiceContext } from "@executioncontrolprotocol/engine"
import { IMPLEMENTATION_IDS, SECRET_KEY_PATTERN, type SecretsProvider } from "@executioncontrolprotocol/protocol"

const KEY_RE = new RegExp(SECRET_KEY_PATTERN)
const ECP_KEYRING_SERVICE = "ecp"
/** Name-only index so `list` works when Secret Service cannot enumerate (headless CI). */
const KEYS_INDEX_FILE = "secrets.keys.json"

/**
 * OS keychain + `ECP_SECRET_*` env fallback.
 * @category Secrets
 */
export class LocalSecrets implements SecretsProvider {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.localSecrets

  private keychainAvailable: boolean | undefined
  private readonly home: string

  /**
   * @param ctx Service context; `settings.home` holds the name-only key index.
   */
  constructor(ctx: ServiceContext) {
    this.home = ctx.settings.home
  }

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
    this.addIndexedKey(canonicalSecretKey(key))
  }

  /** Delete one key from the keychain (env is not mutated). */
  async delete(key: string): Promise<boolean> {
    assertValidKey(key)
    const canonical = canonicalSecretKey(key)
    const existed = Boolean(await this.getKeychain(canonical))
    try {
      const { Entry } = await import("@napi-rs/keyring")
      new Entry(ECP_KEYRING_SERVICE, canonical).deletePassword()
    } catch {
      // missing is fine
    }
    this.removeIndexedKey(canonical)
    return existed
  }

  /** Key names from keychain and matching env vars, sorted unique. */
  async list(): Promise<string[]> {
    return (await this.listDetailed()).map((row) => row.key)
  }

  /**
   * Keys with provenance. Keychain wins when both are set.
   * @category Secrets
   */
  async listDetailed(): Promise<Array<{ key: string; source: "keychain" | "env" }>> {
    const keychain = new Set(await this.listKeychain())
    const envKeys = new Set<string>()
    for (const [name, value] of Object.entries(process.env)) {
      if (!name.startsWith("ECP_SECRET_") || value === undefined) continue
      const logical = name.slice("ECP_SECRET_".length)
      if (KEY_RE.test(logical)) envKeys.add(logical)
    }
    const keys = new Set<string>([...keychain, ...envKeys])
    return [...keys]
      .sort()
      .map((key) => ({ key, source: keychain.has(key) ? ("keychain" as const) : ("env" as const) }))
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
    const fromOs = new Set<string>()
    try {
      const { findCredentials } = await import("@napi-rs/keyring")
      for (const cred of findCredentials(ECP_KEYRING_SERVICE)) {
        fromOs.add(canonicalSecretKey(cred.account))
      }
    } catch {
      // Secret Service may refuse enumeration on headless runners.
    }
    for (const key of this.readIndexedKeys()) {
      if (fromOs.has(key)) continue
      // Index is name-only; confirm the value is still in the keychain.
      if (await this.getKeychain(key)) fromOs.add(key)
      else this.removeIndexedKey(key)
    }
    return [...fromOs].sort()
  }

  private indexPath(): string {
    return path.join(this.home, KEYS_INDEX_FILE)
  }

  private readIndexedKeys(): string[] {
    const file = this.indexPath()
    if (!existsSync(file)) return []
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as unknown
      if (!Array.isArray(raw)) return []
      return raw.filter((item): item is string => typeof item === "string" && KEY_RE.test(item))
    } catch {
      return []
    }
  }

  private writeIndexedKeys(keys: string[]): void {
    mkdirSync(this.home, { recursive: true })
    writeFileSync(this.indexPath(), `${JSON.stringify([...new Set(keys)].sort(), null, 2)}\n`, "utf8")
  }

  private addIndexedKey(key: string): void {
    const keys = this.readIndexedKeys()
    if (keys.includes(key)) return
    keys.push(key)
    this.writeIndexedKeys(keys)
  }

  private removeIndexedKey(key: string): void {
    const keys = this.readIndexedKeys().filter((item) => item !== key)
    this.writeIndexedKeys(keys)
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
