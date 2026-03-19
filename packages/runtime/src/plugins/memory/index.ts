/**
 * Long-term memory plugin — builtin SQLite-backed store.
 *
 * Exposes a MemoryStore for policy-controlled, executor-scoped long-term memory.
 * Access is explicit: executors must declare memory in the Context and have
 * memoryAccess policy allowing read/write.
 *
 * @category Plugins
 */

export type {
  MemoryRecord,
  MemoryGetOptions,
  MemoryListOptions,
  MemoryStore,
  SqliteMemoryStoreConfig,
} from "./types.js";
export { createSqliteMemoryStore } from "./sqlite-memory-store.js";

import type { ExtensionVersion } from "@executioncontrolprotocol/spec";
import type { ExtensionRegistry } from "../../extensions/registry.js";
import type { MemoryStore } from "./types.js";
import { createSqliteMemoryStore } from "./sqlite-memory-store.js";
import type { SqliteMemoryStoreConfig } from "./types.js";

/**
 * Factory returned by the memory plugin's create(). The host calls open()
 * once to obtain the store (async because sql.js loads wasm).
 *
 * @category Plugins
 */
export interface MemoryPluginInstance {
  /** Open the store (load DB from disk if present). */
  open(): Promise<MemoryStore>;
}

/**
 * Register the built-in memory plugin in the extension registry.
 * The plugin creates a SQLite-backed store (sql.js) for long-term memory.
 */
export function registerBuiltinMemoryPlugin(
  registry: ExtensionRegistry,
  config: { version?: ExtensionVersion } = {},
): void {
  const version = config.version ?? "0.3.0";

  registry.registerPlugin({
    id: "memory",
    kind: "plugin",
    sourceType: "builtin",
    version,
    description:
      "Built-in long-term memory store (SQLite via sql.js). Policy-controlled, executor-scoped; does not inject memory by default.",
    create(pluginConfig?: Record<string, unknown>) {
      const cfg = (pluginConfig ?? {}) as SqliteMemoryStoreConfig;
      return {
        async open(): Promise<MemoryStore> {
          return createSqliteMemoryStore(cfg);
        },
      };
    },
  });
}
