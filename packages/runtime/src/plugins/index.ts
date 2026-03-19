/**
 * ECP runtime plugins (storage, memory, etc.).
 *
 * @category Plugins
 */

export {
  registerBuiltinMemoryPlugin,
  createSqliteMemoryStore,
  type MemoryPluginInstance,
} from "./memory/index.js";
export type { MemoryStore, MemoryRecord, SqliteMemoryStoreConfig } from "./memory/types.js";
