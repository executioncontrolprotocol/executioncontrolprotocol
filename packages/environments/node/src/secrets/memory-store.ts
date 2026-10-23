import type { SecretsStore } from "./store.js"

const memoryStore = new Map<string, string>()

/** In-memory secrets store for tests. @category Secrets */
export const memorySecretsStore: SecretsStore = {
  async get(key) {
    return memoryStore.get(key)
  },
  async set(key, value) {
    memoryStore.set(key, value)
  },
  async delete(key) {
    memoryStore.delete(key)
  },
  async list() {
    return [...memoryStore.keys()]
  },
  async isAvailable() {
    return true
  },
}

/** Set a value in the in-memory store (tests). @category Secrets */
export function setMemorySecret(key: string, value: string): void {
  memoryStore.set(key, value)
}

/** Clear the in-memory store (tests). @category Secrets */
export function clearMemorySecrets(): void {
  memoryStore.clear()
}
