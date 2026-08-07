import {
  PBKDF2_ITERATIONS,
  VAULT_SALT_KEY,
  VAULT_VERIFIER_KEY,
  VAULT_VERIFIER_PLAINTEXT,
} from "../constants.js"

/** Minimal key-value storage for vault metadata and ciphertext. @category BrowserSecrets */
export interface VaultStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Encrypted secret record persisted in storage. @category BrowserSecrets */
export interface EncryptedSecretRecord {
  v: 1
  iv: string
  ciphertext: string
}

function getCrypto(): Crypto {
  if (typeof globalThis.crypto?.subtle === "undefined") {
    throw new Error("Web Crypto API is not available")
  }
  return globalThis.crypto
}

function encodeBase64Url(bytes: Uint8Array): string {
  const bin = String.fromCharCode(...bytes)
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64")
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const padLen = (4 - (padded.length % 4)) % 4
  const b64 = padded + "=".repeat(padLen)
  const bin =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary")
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function toBufferSource(bytes: Uint8Array): BufferSource {
  return new Uint8Array(bytes)
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  getCrypto().getRandomValues(bytes)
  return bytes
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await getCrypto().subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  )
  return getCrypto().subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toBufferSource(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}


export { PBKDF2_ITERATIONS }

/** Passphrase-protected AES-GCM vault (master key in memory only). @category BrowserSecrets */
export class BrowserSecretsVault {
  private masterKey: CryptoKey | undefined

  constructor(private readonly storage: VaultStorage) {}

  /** Whether vault metadata exists in storage. */
  hasVault(): boolean {
    return this.storage.getItem(VAULT_SALT_KEY) !== null
  }

  /** Whether the master key is loaded in memory. */
  isUnlocked(): boolean {
    return this.masterKey !== undefined
  }

  /** Create a new vault with the given passphrase. */
  async setup(passphrase: string): Promise<void> {
    if (this.hasVault()) {
      throw new Error("Browser secrets vault already exists")
    }
    const salt = randomBytes(16)
    const key = await deriveKey(passphrase, salt)
    const verifier = await this.encryptWithKey(key, VAULT_VERIFIER_PLAINTEXT)
    this.storage.setItem(VAULT_SALT_KEY, encodeBase64Url(salt))
    this.storage.setItem(VAULT_VERIFIER_KEY, JSON.stringify(verifier))
    this.masterKey = key
  }

  /** Unlock an existing vault; returns false when passphrase is wrong. */
  async unlock(passphrase: string): Promise<boolean> {
    const saltRaw = this.storage.getItem(VAULT_SALT_KEY)
    const verifierRaw = this.storage.getItem(VAULT_VERIFIER_KEY)
    if (!saltRaw || !verifierRaw) return false
    const salt = decodeBase64Url(saltRaw)
    const key = await deriveKey(passphrase, salt)
    try {
      const record = JSON.parse(verifierRaw) as EncryptedSecretRecord
      const plain = await this.decryptWithKey(key, record)
      if (plain !== VAULT_VERIFIER_PLAINTEXT) return false
      this.masterKey = key
      return true
    } catch {
      return false
    }
  }

  /** Clear the in-memory master key. */
  lock(): void {
    this.masterKey = undefined
  }

  /** Encrypt plaintext with the unlocked master key. */
  async encrypt(plaintext: string): Promise<EncryptedSecretRecord> {
    const key = this.requireKey()
    return this.encryptWithKey(key, plaintext)
  }

  /** Decrypt a stored record with the unlocked master key. */
  async decrypt(record: EncryptedSecretRecord): Promise<string> {
    const key = this.requireKey()
    return this.decryptWithKey(key, record)
  }

  private requireKey(): CryptoKey {
    if (!this.masterKey) {
      throw new Error("Browser secrets vault is locked")
    }
    return this.masterKey
  }

  private async encryptWithKey(key: CryptoKey, plaintext: string): Promise<EncryptedSecretRecord> {
    const iv = randomBytes(12)
    const enc = new TextEncoder()
    const ciphertext = await getCrypto().subtle.encrypt(
      { name: "AES-GCM", iv: toBufferSource(iv) },
      key,
      enc.encode(plaintext)
    )
    return {
      v: 1,
      iv: encodeBase64Url(iv),
      ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    }
  }

  private async decryptWithKey(key: CryptoKey, record: EncryptedSecretRecord): Promise<string> {
    const iv = decodeBase64Url(record.iv)
    const data = decodeBase64Url(record.ciphertext)
    const plain = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: toBufferSource(iv) },
      key,
      toBufferSource(data)
    )
    return new TextDecoder().decode(plain)
  }
}

/** In-memory storage for unit tests. @category BrowserSecrets */
export function createMemoryVaultStorage(): VaultStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  }
}

/** Default localStorage-backed storage when available. @category BrowserSecrets */
export function createLocalVaultStorage(): VaultStorage {
  if (typeof localStorage === "undefined") {
    throw new Error("localStorage is not available")
  }
  return {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
  }
}
