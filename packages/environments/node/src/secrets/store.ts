/** OS secrets backend for lookup and CLI CRUD. @category Secrets */
export interface SecretsStore {
  /** Load a secret value or undefined when missing. */
  get(key: string): Promise<string | undefined>
  /** Store or replace a secret value. */
  set(key: string, value: string): Promise<void>
  /** Delete a secret when present. */
  delete(key: string): Promise<void>
  /** List logical keys in the store. */
  list(): Promise<string[]>
  /** Whether this backend is available on the current host. */
  isAvailable(): Promise<boolean>
}
