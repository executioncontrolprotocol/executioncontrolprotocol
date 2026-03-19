/**
 * SQLite-backed long-term memory store using sql.js (portable, no native deps).
 *
 * Persists to a single file per namespace. Safe for multiple runs; loads on
 * first use and saves on close (and optionally after each write if needed).
 *
 * @category Plugins
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MemoryScope } from "@executioncontrolprotocol/spec";
import type {
  MemoryRecord,
  MemoryGetOptions,
  MemoryListOptions,
  SqliteMemoryStoreConfig,
} from "./types.js";

const TABLE = "memories";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ${TABLE} (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  executor_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_scope_executor ON ${TABLE}(scope, executor_name);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON ${TABLE}(created_at);
`;

/**
 * Rough chars-to-tokens ratio for truncation (approx 4 chars per token).
 */
const CHARS_PER_TOKEN = 4;

/**
 * Create and initialize a SQLite-backed memory store. Uses sql.js; in Node
 * the wasm file is resolved from the package dist. Persists to a file under
 * dataDir (or current working directory).
 */
export async function createSqliteMemoryStore(
  config: SqliteMemoryStoreConfig = {},
): Promise<import("./types.js").MemoryStore> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();
  const dataDir = config.dataDir ?? join(process.cwd(), ".ecp");
  const filename = config.filename ?? "ecp-memory.sqlite";
  const namespace = config.namespace ?? "default";
  const safeNamespace = namespace.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = join(dataDir, safeNamespace + "-" + filename);

  let db: import("sql.js").Database;
  if (existsSync(filePath)) {
    const buf = readFileSync(filePath);
    db = new SQL.Database(new Uint8Array(buf));
  } else {
    db = new SQL.Database();
  }

  db.run(SCHEMA);

  function save(): void {
    mkdirSync(dirname(filePath), { recursive: true });
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(filePath, buffer);
  }

  const store: import("./types.js").MemoryStore = {
    async get(scope: MemoryScope, options?: MemoryGetOptions): Promise<MemoryRecord[]> {
      const maxItems = options?.maxItems ?? 20;
      const executorName = options?.executorName;
      const summariesOnly = options?.summariesOnly ?? true;
      const maxTokens = options?.maxTokens;

      let sql = `SELECT id, scope, executor_name, summary, payload, created_at, updated_at FROM ${TABLE} WHERE scope = ?`;
      const params: (string | number)[] = [scope];
      if (executorName) {
        sql += " AND executor_name = ?";
        params.push(executorName);
      }
      sql += " ORDER BY updated_at DESC LIMIT ?";
      params.push(maxItems * 2);

      const result = db.exec(sql, params);
      if (!result.length || !result[0].values.length) {
        return [];
      }

      const columns = result[0].columns;
      const rows = result[0].values as unknown[][];
      const records: MemoryRecord[] = [];
      let totalChars = 0;

      for (const row of rows) {
        if (records.length >= maxItems) break;
        const rec = rowToRecord(columns, row);
        if (maxTokens !== undefined) {
          const needChars = (rec.summary.length + (summariesOnly ? 0 : JSON.stringify(rec.payload ?? {}).length)) + 50;
          if (totalChars + needChars > maxTokens * CHARS_PER_TOKEN) break;
          totalChars += needChars;
        }
        if (summariesOnly) {
          records.push({
            id: rec.id,
            scope: rec.scope,
            executorName: rec.executorName,
            summary: rec.summary,
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt,
          });
        } else {
          records.push(rec);
        }
      }

      return records;
    },

    async put(
      scope: MemoryScope,
      executorName: string,
      summary: string,
      payload?: Record<string, unknown>,
      id?: string,
    ): Promise<MemoryRecord> {
      const recordId = id ?? crypto.randomUUID();
      const now = new Date().toISOString();
      const payloadJson = payload !== undefined ? JSON.stringify(payload) : null;

      db.run(
        `INSERT INTO ${TABLE} (id, scope, executor_name, summary, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET summary=?, payload=?, updated_at=?`,
        [recordId, scope, executorName, summary, payloadJson, now, now, summary, payloadJson, now],
      );
      save();

      return {
        id: recordId,
        scope,
        executorName,
        summary,
        payload,
        createdAt: now,
        updatedAt: now,
      };
    },

    async list(
      scope: MemoryScope,
      options?: MemoryListOptions,
    ): Promise<Pick<MemoryRecord, "id" | "summary" | "createdAt">[]> {
      const limit = options?.limit ?? 100;
      let sql = `SELECT id, summary, created_at FROM ${TABLE} WHERE scope = ?`;
      const params: (string | number)[] = [scope];
      if (options?.executorName) {
        sql += " AND executor_name = ?";
        params.push(options.executorName);
      }
      if (options?.olderThan) {
        sql += " AND created_at < ?";
        params.push(options.olderThan);
      }
      sql += " ORDER BY created_at DESC LIMIT ?";
      params.push(limit);

      const result = db.exec(sql, params);
      if (!result.length || !result[0].values.length) {
        return [];
      }

      const columns = result[0].columns;
      const rows = result[0].values as unknown[][];
      return rows.map((row) => {
        const idx = (name: string) => columns.indexOf(name);
        return {
          id: String(row[idx("id")]),
          summary: String(row[idx("summary")]),
          createdAt: String(row[idx("created_at")]),
        };
      });
    },

    async delete(
      scope: MemoryScope,
      options?: { id?: string; ids?: string[]; olderThan?: string; executorName?: string },
    ): Promise<{ deleted: number }> {
      if (options?.id) {
        const stmt = db.prepare(`DELETE FROM ${TABLE} WHERE scope = ? AND id = ?`);
        stmt.run([scope, options.id]);
        stmt.free();
        save();
        return { deleted: 1 };
      }

      if (options?.ids?.length) {
        const placeholders = options.ids.map(() => "?").join(",");
        const sql = `DELETE FROM ${TABLE} WHERE scope = ? AND id IN (${placeholders})`;
        const stmt = db.prepare(sql);
        stmt.run([scope, ...options.ids]);
        stmt.free();
        save();
        return { deleted: options.ids.length };
      }

      let sql = `DELETE FROM ${TABLE} WHERE scope = ?`;
      const params: (string | number)[] = [scope];
      if (options?.executorName) {
        sql += " AND executor_name = ?";
        params.push(options.executorName);
      }
      if (options?.olderThan) {
        sql += " AND created_at < ?";
        params.push(options.olderThan);
      }
      const stmt = db.prepare(sql);
      stmt.run(params);
      stmt.free();
      const countResult = db.exec("SELECT changes() as n");
      const deleted =
        countResult.length > 0 && countResult[0].values.length > 0
          ? Number(countResult[0].values[0][0])
          : 0;
      save();
      return { deleted };
    },

    async close(): Promise<void> {
      save();
      db.close();
    },
  };

  return store;
}

function rowToRecord(columns: string[], row: unknown[]): MemoryRecord {
  const idx = (name: string) => columns.indexOf(name);
  const payloadRaw = row[idx("payload")];
  return {
    id: String(row[idx("id")]),
    scope: row[idx("scope")] as MemoryScope,
    executorName: String(row[idx("executor_name")]),
    summary: String(row[idx("summary")]),
    payload: payloadRaw != null ? (JSON.parse(String(payloadRaw)) as Record<string, unknown>) : undefined,
    createdAt: String(row[idx("created_at")]),
    updatedAt: String(row[idx("updated_at")]),
  };
}
