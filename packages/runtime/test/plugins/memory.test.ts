/**
 * Unit tests for the long-term memory plugin (SQLite store and registration).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteMemoryStore } from "../../src/plugins/memory/sqlite-memory-store.js";
import { registerBuiltinMemoryPlugin } from "../../src/plugins/memory/index.js";
import { ExtensionRegistry } from "../../src/extensions/registry.js";

describe("createSqliteMemoryStore", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "ecp-memory-test-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("creates a store with default config when options are empty", async () => {
    const store = await createSqliteMemoryStore({});
    expect(store.get).toBeDefined();
    expect(store.put).toBeDefined();
    expect(store.list).toBeDefined();
    expect(store.delete).toBeDefined();
    expect(store.close).toBeDefined();
    await store.close();
  });

  it("persists and retrieves records with put and get", async () => {
    const store = await createSqliteMemoryStore({
      dataDir,
      namespace: "test-ns",
    });

    const rec = await store.put("context", "exec1", "User prefers dark mode", {
      theme: "dark",
    });
    expect(rec.id).toBeDefined();
    expect(rec.scope).toBe("context");
    expect(rec.executorName).toBe("exec1");
    expect(rec.summary).toBe("User prefers dark mode");
    expect(rec.payload).toEqual({ theme: "dark" });
    expect(rec.createdAt).toBeDefined();
    expect(rec.updatedAt).toBeDefined();

    const list = await store.get("context", {
      executorName: "exec1",
      maxItems: 10,
      summariesOnly: false,
    });
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(rec.id);
    expect(list[0].summary).toBe("User prefers dark mode");
    expect(list[0].payload).toEqual({ theme: "dark" });

    await store.close();
  });

  it("returns only summaries when summariesOnly is true", async () => {
    const store = await createSqliteMemoryStore({ dataDir, namespace: "summaries" });
    await store.put("context", "e1", "Summary one", { key: "value" });

    const list = await store.get("context", {
      executorName: "e1",
      maxItems: 10,
      summariesOnly: true,
    });
    expect(list.length).toBe(1);
    expect(list[0].summary).toBe("Summary one");
    expect((list[0] as { payload?: unknown }).payload).toBeUndefined();

    await store.close();
  });

  it("respects maxItems when getting", async () => {
    const store = await createSqliteMemoryStore({ dataDir, namespace: "max" });
    for (let i = 0; i < 5; i++) {
      await store.put("context", "e1", `Item ${i}`);
    }

    const list = await store.get("context", { executorName: "e1", maxItems: 2 });
    expect(list.length).toBe(2);

    await store.close();
  });

  it("lists records with list()", async () => {
    const store = await createSqliteMemoryStore({ dataDir, namespace: "list" });
    await store.put("context", "e1", "First");
    await store.put("context", "e1", "Second");

    const items = await store.list("context", { executorName: "e1", limit: 10 });
    expect(items.length).toBe(2);
    expect(items.every((x) => x.id && x.summary && x.createdAt)).toBe(true);

    await store.close();
  });

  it("deletes by id and returns deleted count", async () => {
    const store = await createSqliteMemoryStore({ dataDir, namespace: "del" });
    const r1 = await store.put("context", "e1", "To delete");
    const r2 = await store.put("context", "e1", "To keep");

    const result = await store.delete("context", { id: r1.id });
    expect(result.deleted).toBe(1);

    const list = await store.get("context", { executorName: "e1", maxItems: 10 });
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(r2.id);

    await store.close();
  });

  it("deletes by ids array", async () => {
    const store = await createSqliteMemoryStore({ dataDir, namespace: "del-ids" });
    const r1 = await store.put("context", "e1", "A");
    const r2 = await store.put("context", "e1", "B");
    await store.put("context", "e1", "C");

    const result = await store.delete("context", { ids: [r1.id, r2.id] });
    expect(result.deleted).toBe(2);

    const list = await store.list("context", { executorName: "e1" });
    expect(list.length).toBe(1);

    await store.close();
  });

  it("deletes by olderThan", async () => {
    const store = await createSqliteMemoryStore({ dataDir, namespace: "older" });
    await store.put("context", "e1", "Old");
    const r2 = await store.put("context", "e1", "New");

    const result = await store.delete("context", { olderThan: r2.createdAt });
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    await store.close();
  });

  it("filters get by scope and executorName", async () => {
    const store = await createSqliteMemoryStore({ dataDir, namespace: "filter" });
    await store.put("context", "e1", "E1 summary");
    await store.put("context", "e2", "E2 summary");
    await store.put("user", "e1", "User E1");

    const contextE1 = await store.get("context", { executorName: "e1", maxItems: 10 });
    expect(contextE1.length).toBe(1);
    expect(contextE1[0].executorName).toBe("e1");

    const userE1 = await store.get("user", { executorName: "e1", maxItems: 10 });
    expect(userE1.length).toBe(1);
    expect(userE1[0].summary).toBe("User E1");

    await store.close();
  });

  it("persists across open/close when using same dataDir and namespace", async () => {
    const config = { dataDir, namespace: "persist" };
    const store1 = await createSqliteMemoryStore(config);
    await store1.put("context", "e1", "Survives close");
    await store1.close();

    const store2 = await createSqliteMemoryStore(config);
    const list = await store2.get("context", { executorName: "e1", maxItems: 10 });
    expect(list.length).toBe(1);
    expect(list[0].summary).toBe("Survives close");
    await store2.close();
  });
});

describe("registerBuiltinMemoryPlugin", () => {
  it("registers a plugin with id memory", () => {
    const registry = new ExtensionRegistry();
    registerBuiltinMemoryPlugin(registry);
    registry.lock();

    const plugins = registry.listPlugins();
    const plugin = plugins.find((p) => p.id === "memory");
    expect(plugin).toBeDefined();
    expect(plugin?.id).toBe("memory");
    expect(plugin?.kind).toBe("plugin");
    expect(plugin?.version).toBe("0.3.0");
  });

  it("create().open() returns a MemoryStore", async () => {
    const registry = new ExtensionRegistry();
    registerBuiltinMemoryPlugin(registry);
    registry.lock();

    const plugins = registry.listPlugins();
    const plugin = plugins.find((p) => p.id === "memory");
    expect(plugin).toBeDefined();
    const instance = plugin!.create({}) as { open(): Promise<{ get: unknown; put: unknown; list: unknown; delete: unknown; close: () => Promise<void> }> };
    const store = await instance.open();
    expect(store.get).toBeDefined();
    expect(store.put).toBeDefined();
    expect(store.list).toBeDefined();
    expect(store.delete).toBeDefined();
    expect(store.close).toBeDefined();
    await store.close();
  });
});
