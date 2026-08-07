import {
  SECRET_INDEX_KEY,
  SECRET_STORAGE_PREFIX,
} from "./constants.js"
import type { BrowserSecretsVault, EncryptedSecretRecord, VaultStorage } from "./crypto/vault.js"

function readIndex(storage: VaultStorage): string[] {
  const raw = storage.getItem(SECRET_INDEX_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : []
  } catch {
    return []
  }
}

function writeIndex(storage: VaultStorage, keys: string[]): void {
  storage.setItem(SECRET_INDEX_KEY, JSON.stringify([...new Set(keys)].sort()))
}

function storageKey(logicalKey: string): string {
  return `${SECRET_STORAGE_PREFIX}${logicalKey}`
}

/** Secret store backed by encrypted localStorage records. @category BrowserSecrets */
export class BrowserSecretStore {
  constructor(
    private readonly vault: BrowserSecretsVault,
    private readonly storage: VaultStorage
  ) {}

  async get(key: string): Promise<string | undefined> {
    if (!this.vault.isUnlocked()) return undefined
    const raw = this.storage.getItem(storageKey(key))
    if (!raw) return undefined
    try {
      const record = JSON.parse(raw) as EncryptedSecretRecord
      return await this.vault.decrypt(record)
    } catch {
      return undefined
    }
  }

  async set(key: string, value: string): Promise<void> {
    const record = await this.vault.encrypt(value)
    this.storage.setItem(storageKey(key), JSON.stringify(record))
    const index = readIndex(this.storage)
    if (!index.includes(key)) {
      writeIndex(this.storage, [...index, key])
    }
  }

  async delete(key: string): Promise<void> {
    this.storage.removeItem(storageKey(key))
    writeIndex(
      this.storage,
      readIndex(this.storage).filter((k) => k !== key)
    )
  }

  async list(): Promise<string[]> {
    return readIndex(this.storage)
  }
}
