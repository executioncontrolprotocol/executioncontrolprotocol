import {
  defineExtension,
  hook,
  globalRegistry,
  catalogExtension,
  SECRETS_RESOLVER_ID,
  type EnvironmentConfigResolver,
  type LifecycleContext,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import { createOsSecretsStore } from "./os-keychain-store.js"
import { memorySecretsStore, setMemorySecret, clearMemorySecrets } from "./memory-store.js"
import type { SecretsStore } from "./store.js"

const EXT_ID = "@executioncontrolprotocol/secrets"

let activeStore: SecretsStore = createOsSecretsStore()

/** Replace the active secrets store (e.g. in-memory for tests). @category Secrets */
export function setSecretsStore(store: SecretsStore): void {
  activeStore = store
}

/** Alias for {@link setSecretsStore}. @category Secrets */
export function setSecretsProvider(store: SecretsStore): void {
  setSecretsStore(store)
}

/** Restore the default OS keychain store. @category Secrets */
export function resetSecretsStore(): void {
  activeStore = createOsSecretsStore()
}

function attachSecretsResolver(ctx: LifecycleContext): void {
  const host = ctx.environment
  if (!host) return

  const resolver: EnvironmentConfigResolver = {
    id: SECRETS_RESOLVER_ID,
    async resolve(name: string) {
      return activeStore.get(name)
    },
  }
  host.registerConfigResolver(resolver)
}

/** OS secrets extension. @category Secrets */
export const secretsExtension = defineExtension("@executioncontrolprotocol", "secrets")
  .withSupportedRuntimes(["@executioncontrolprotocol/node"])
  .withConfig(z.object({}))
  .withHooks([
    hook("environment:configuring", attachSecretsResolver),
    hook("environment:terminate", () => undefined),
  ])
  .build()

catalogExtension(secretsExtension)

/** Register `@executioncontrolprotocol/secrets`. @category Secrets */
export async function registerSecretsExtension(registry = globalRegistry): Promise<void> {
  if (!registry.getExtension(EXT_ID)) {
    await registry.registerExtension(secretsExtension)
  }
}

export { memorySecretsStore, setMemorySecret, clearMemorySecrets }
export { createOsSecretsStore, secretRefId, OsKeychainSecretsStore } from "./os-keychain-store.js"
export { redactSecret } from "./redaction.js"
export { canonicalSecretKey, secretRefIdFromLogicalKey } from "./ref.js"
export {
  normalizeOsKeychainAccountKey,
  osKeychainCredentialTarget,
  canonicalSecretKeyForOsStorage,
} from "./os-keychain-account-key.js"
export { ECP_SECRET_REF_PROTOCOL_PREFIX, ECP_KEYRING_SERVICE } from "./constants.js"
export type { SecretsStore } from "./store.js"

/** @category Secrets */
export const memorySecretsProvider = memorySecretsStore

export default secretsExtension
