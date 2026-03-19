/**
 * Long-term memory plugin types and contracts.
 *
 * Memory is scoped (user, context, org), policy-controlled, and exposed to
 * executors only when declared and allowed. Storage is pluggable; the builtin
 * uses a portable SQLite backend (sql.js).
 *
 * @category Plugins
 */

import type { MemoryScope } from "@executioncontrolprotocol/spec";

/**
 * A single memory record stored for an executor in a given scope.
 *
 * @category Plugins
 */
export interface MemoryRecord {
  /** Unique id (e.g. UUID or row id). */
  id: string;

  /** Scope of the memory (user, context, org). */
  scope: MemoryScope;

  /** Executor name that wrote this memory (optional for shared scope). */
  executorName: string;

  /** Short summary used for retrieval and context injection (kept under token budget). */
  summary: string;

  /** Optional full payload (JSON). May be omitted when injecting to save tokens. */
  payload?: Record<string, unknown>;

  /** ISO-8601 created timestamp. */
  createdAt: string;

  /** ISO-8601 last updated timestamp. */
  updatedAt: string;
}

/**
 * Options when reading memories (to avoid blowing up context windows).
 *
 * @category Plugins
 */
export interface MemoryGetOptions {
  /** Maximum number of records to return. */
  maxItems?: number;

  /** Approximate max tokens for combined summary text; store may truncate. */
  maxTokens?: number;

  /** Optional executor filter (only memories written by this executor). */
  executorName?: string;

  /** Optional: return only summaries (omit payload) to save tokens. */
  summariesOnly?: boolean;
}

/**
 * Options when listing or querying memories (e.g. for cleanup).
 *
 * @category Plugins
 */
export interface MemoryListOptions {
  /** Maximum number of records to return. */
  limit?: number;

  /** Optional executor filter. */
  executorName?: string;

  /** Optional: only records older than this ISO-8601 timestamp (for cleanup). */
  olderThan?: string;
}

/**
 * Contract for a long-term memory store. Implementations are pluggable;
 * the builtin uses sql.js (SQLite) for portability.
 *
 * @category Plugins
 */
export interface MemoryStore {
  /**
   * Get memories for the given scope, optionally filtered by executor.
   * Returns records ordered by recency (newest first), bounded by options.
   */
  get(
    scope: MemoryScope,
    options?: MemoryGetOptions,
  ): Promise<MemoryRecord[]>;

  /**
   * Store a memory record. Id may be generated if not provided.
   */
  put(
    scope: MemoryScope,
    executorName: string,
    summary: string,
    payload?: Record<string, unknown>,
    id?: string,
  ): Promise<MemoryRecord>;

  /**
   * List memory ids (and optionally summaries) for querying or cleanup.
   */
  list(
    scope: MemoryScope,
    options?: MemoryListOptions,
  ): Promise<Pick<MemoryRecord, "id" | "summary" | "createdAt">[]>;

  /**
   * Delete one or more memories by id. When id is omitted, may delete by scope/executor/age (implementation-defined).
   */
  delete(
    scope: MemoryScope,
    options?: { id?: string; ids?: string[]; olderThan?: string; executorName?: string },
  ): Promise<{ deleted: number }>;

  /**
   * Close the store and persist data (for file-backed stores).
   */
  close(): Promise<void>;
}

/**
 * Configuration for the builtin SQLite memory store.
 *
 * @category Plugins
 */
export interface SqliteMemoryStoreConfig {
  /** Directory path for the SQLite file (default: process cwd or .ecp). */
  dataDir?: string;

  /** Base name for the database file (default: "ecp-memory.sqlite"). */
  filename?: string;

  /** Context or tenant id used to namespace the file (e.g. context name + version). */
  namespace?: string;
}
