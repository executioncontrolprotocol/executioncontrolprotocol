import {
  defineExtension,
  hook,
  globalRegistry,
  catalogExtension,
  BROWSER_SECRETS_RESOLVER_ID,
  type EnvironmentConfigResolver,
  type LifecycleContext,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import {
  BrowserSecretsVault,
  createLocalVaultStorage,
  createMemoryVaultStorage,
  type VaultStorage,
} from "./crypto/vault.js"
import { BrowserSecretStore } from "./store.js"

const EXT_ID = "@executioncontrolprotocol/browser-secrets"

let storage: VaultStorage = typeof localStorage !== "undefined" ? createLocalVaultStorage() : createMemoryVaultStorage()
let vault = new BrowserSecretsVault(storage)
let store = new BrowserSecretStore(vault, storage)

function refreshStore(): void {
  vault = new BrowserSecretsVault(storage)
  store = new BrowserSecretStore(vault, storage)
}

/** Replace vault storage (tests). @category BrowserSecrets */
export function setBrowserSecretsStorage(next: VaultStorage): void {
  storage = next
  refreshStore()
}

/** Replace vault instance (tests). @category BrowserSecrets */
export function setBrowserSecretsVault(next: BrowserSecretsVault): void {
  vault = next
  store = new BrowserSecretStore(vault, storage)
}

/** Reset to default localStorage-backed vault. @category BrowserSecrets */
export function resetBrowserSecretsVault(): void {
  storage = typeof localStorage !== "undefined" ? createLocalVaultStorage() : createMemoryVaultStorage()
  refreshStore()
}

/** Whether vault metadata exists. @category BrowserSecrets */
export function hasBrowserVault(): boolean {
  return vault.hasVault()
}

/** Whether the vault master key is in memory. @category BrowserSecrets */
export function isBrowserVaultUnlocked(): boolean {
  return vault.isUnlocked()
}

/** Create a new passphrase-protected vault. @category BrowserSecrets */
export async function setupBrowserVault(passphrase: string): Promise<void> {
  await vault.setup(passphrase)
}

/** Unlock an existing vault. @category BrowserSecrets */
export async function unlockBrowserVault(passphrase: string): Promise<boolean> {
  return vault.unlock(passphrase)
}

/** Lock the vault (clear in-memory key). @category BrowserSecrets */
export function lockBrowserVault(): void {
  vault.lock()
}

/** Store an encrypted secret (vault must be unlocked). @category BrowserSecrets */
export async function setBrowserSecret(key: string, value: string): Promise<void> {
  await store.set(key, value)
}

/** Read a decrypted secret when vault is unlocked. @category BrowserSecrets */
export async function getBrowserSecret(key: string): Promise<string | undefined> {
  return store.get(key)
}

/** Remove a secret from the vault. @category BrowserSecrets */
export async function deleteBrowserSecret(key: string): Promise<void> {
  await store.delete(key)
}

/** List logical secret keys in the index. @category BrowserSecrets */
export async function listBrowserSecretKeys(): Promise<string[]> {
  return store.list()
}

function attachBrowserSecretsResolver(ctx: LifecycleContext): void {
  const host = ctx.environment
  if (!host) return

  const resolver: EnvironmentConfigResolver = {
    id: BROWSER_SECRETS_RESOLVER_ID,
    async resolve(name: string) {
      return store.get(name)
    },
  }
  host.registerConfigResolver(resolver)
}

/** Browser encrypted secrets extension. @category BrowserSecrets */
export const browserSecretsExtension = defineExtension("@executioncontrolprotocol", "browser-secrets")
  .withSupportedRuntimes(["@executioncontrolprotocol/browser"])
  .withConfig(z.object({}))
  .withHooks([
    hook("environment:configuring", attachBrowserSecretsResolver),
    hook("environment:terminate", () => {
      lockBrowserVault()
    }),
  ])
  .build()

catalogExtension(browserSecretsExtension)

/** Register `@executioncontrolprotocol/browser-secrets`. @category BrowserSecrets */
export async function registerBrowserSecretsExtension(registry = globalRegistry): Promise<void> {
  if (!registry.getExtension(EXT_ID)) {
    await registry.registerExtension(browserSecretsExtension)
  }
}

export { createMemoryVaultStorage, createLocalVaultStorage, BrowserSecretsVault } from "./crypto/vault.js"
export type { VaultStorage, EncryptedSecretRecord } from "./crypto/vault.js"

export default browserSecretsExtension
