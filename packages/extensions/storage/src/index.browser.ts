import {
  catalogExtension,
  globalRegistry,
  type Registry,
} from "@executioncontrolprotocol/core"
import { buildStorageExtension, EXT_ID, HOST_HOP_MESSAGE } from "./shared.js"

async function hostHop(): Promise<never> {
  throw new Error(HOST_HOP_MESSAGE)
}

/**
 * Browser catalog: storage write/read hop to the host (`ecp up`).
 * Does not import `node:fs`.
 * @category Storage
 */
export const storageExtension = buildStorageExtension({
  write: hostHop,
  read: hostHop,
})

catalogExtension(storageExtension)

/**
 * Register `@executioncontrolprotocol/storage` on a registry.
 * @category Storage
 */
export async function registerStorageExtension(
  registry: Registry = globalRegistry
): Promise<void> {
  if (!registry.getExtension(EXT_ID)) {
    await registry.registerExtension(storageExtension)
  }
}

export {
  storageWriteInputSchema,
  storageWriteOutputSchema,
  storageReadInputSchema,
  storageReadOutputSchema,
  storageTier,
} from "./schemas.js"
export {
  STORAGE_URI_PREFIX,
  storageUri,
  parseStorageKey,
  STORAGE_TIER_DIR,
  ECP_WORKFLOWS_DIR,
  type StorageTier,
} from "./uri.js"
export { EXT_ID, HOST_HOP_MESSAGE, buildStorageExtension, buildStorageCapabilities } from "./shared.js"

export default storageExtension
