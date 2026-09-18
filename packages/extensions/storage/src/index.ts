import {
  catalogExtension,
  globalRegistry,
  type Registry,
} from "@executioncontrolprotocol/core"
import {
  handleStorageRead,
  handleStorageWrite,
  handleWorkflowDelete,
  handleWorkflowList,
  handleWorkflowLoad,
  handleWorkflowSave,
} from "./handlers.js"
import { buildStorageExtension, EXT_ID } from "./shared.js"

/**
 * `@executioncontrolprotocol/storage` — disk-backed temp/durable blob + workflow storage (Node).
 * @category Storage
 */
export const storageExtension = buildStorageExtension({
  write: handleStorageWrite,
  read: handleStorageRead,
  workflowSave: handleWorkflowSave,
  workflowList: handleWorkflowList,
  workflowLoad: handleWorkflowLoad,
  workflowDelete: handleWorkflowDelete,
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
  ensureEcpHomeLayout,
  resolveEcpHome,
  wipeEcpTemp,
  resolveSafeStoragePath,
  writeStorageFile,
  readStorageFile,
  deleteStorageFile,
  listStorageKeys,
} from "./home.js"
export type { StorageSidecar } from "./home.js"
export {
  STORAGE_TIER_DIR,
  ECP_WORKFLOWS_DIR,
  STORAGE_URI_PREFIX,
  storageUri,
  parseStorageKey,
  type StorageTier,
} from "./uri.js"
export {
  handleStorageWrite,
  handleStorageRead,
  handleWorkflowSave,
  handleWorkflowList,
  handleWorkflowLoad,
  handleWorkflowDelete,
  sanitizeWorkflowId,
  workflowFluentFileKey,
  workflowLegacyBundleFileKey,
  workflowIdFromFileKey,
} from "./handlers.js"
export type { StorageExtensionConfig } from "./handlers.js"
export {
  storageWriteInputSchema,
  storageWriteOutputSchema,
  storageReadInputSchema,
  storageReadOutputSchema,
  storageTier,
  WORKFLOW_BUNDLE_SCHEMA,
  WORKFLOW_FLUENT_SUFFIX,
  workflowBundleSchema,
  workflowSaveInputSchema,
  workflowSaveOutputSchema,
  workflowListInputSchema,
  workflowListOutputSchema,
  workflowListEntrySchema,
  workflowLoadInputSchema,
  workflowLoadOutputSchema,
  workflowDeleteInputSchema,
  workflowDeleteOutputSchema,
  type WorkflowBundle,
} from "./schemas.js"
export { EXT_ID, HOST_HOP_MESSAGE, buildStorageExtension, buildStorageCapabilities } from "./shared.js"

export default storageExtension
