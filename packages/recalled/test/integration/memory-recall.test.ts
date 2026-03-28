/**
 * Integration tests for Recalled memory — ingest markdown documents,
 * store them, and verify correct recall across long-term and short-term memory.
 *
 * These tests are deterministic (no LLM required). They verify the full
 * store/query/hybrid pipeline using real SQLite and in-memory backends.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Recalled } from "../../src/recalled.js";
import { createSqliteMemoryStore } from "../../src/backends/sqlite/sqlite-memory-store.js";
import { createInMemoryConversationStore } from "../../src/backends/memory/in-memory-conversation-store.js";
import type { ConversationTurn } from "../../src/models/conversation.js";

const FIXTURES_DIR = join(fileURLToPath(import.meta.url), "../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

function makeTurn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    turnId: crypto.randomUUID(),
    sessionId: "test-session",
    role: "user",
    content: "Hello",
    tokenEstimate: 5,
    timestamp: new Date().toISOString(),
    importanceScore: 0.5,
    ...overrides,
  };
}

describe("Recalled — markdown document recall integration", () => {
  let dataDir: string;
  let recalled: Recalled;
  const gitRebaseContent = loadFixture("skill-git-rebase.md");
  const errorHandlingContent = loadFixture("behavior-error-handling.md");
  const ecpArchContent = loadFixture("reference-ecp-architecture.md");

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "recalled-integration-"));
    const longTermStore = await createSqliteMemoryStore({ dataDir, namespace: "integration" });
    const shortTermStore = createInMemoryConversationStore();
    recalled = new Recalled({ longTermStore, shortTermStore });
  });

  afterEach(async () => {
    await recalled.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("long-term memory: document ingestion and recall", () => {
    it("stores markdown documents as memory records and recalls them", async () => {
      await recalled.storeLongTerm("context", "indexer", gitRebaseContent);
      await recalled.storeLongTerm("context", "indexer", errorHandlingContent);
      await recalled.storeLongTerm("context", "indexer", ecpArchContent);

      const all = await recalled.queryLongTerm("context", {
        executorName: "indexer",
        maxItems: 10,
        summariesOnly: false,
      });

      expect(all.length).toBe(3);
      expect(all.some((r) => r.summary.includes("Git Rebase"))).toBe(true);
      expect(all.some((r) => r.summary.includes("Error Handling"))).toBe(true);
      expect(all.some((r) => r.summary.includes("ECP Architecture"))).toBe(true);
    });

    it("stores documents with structured payload and recalls them", async () => {
      await recalled.storeLongTerm("context", "indexer", "Git Rebase Skill", {
        docType: "skill",
        path: "skill-git-rebase.md",
        content: gitRebaseContent,
        headingPath: "Git Rebase Skill",
      });

      await recalled.storeLongTerm("context", "indexer", "Error Handling Policy", {
        docType: "behavior-policy",
        path: "behavior-error-handling.md",
        content: errorHandlingContent,
        headingPath: "Error Handling Policy",
      });

      const results = await recalled.queryLongTerm("context", {
        executorName: "indexer",
        maxItems: 10,
        summariesOnly: false,
      });

      expect(results.length).toBe(2);

      const gitRecord = results.find((r) => r.summary === "Git Rebase Skill");
      expect(gitRecord).toBeDefined();
      expect(gitRecord!.payload).toBeDefined();
      expect(gitRecord!.payload!.docType).toBe("skill");
      expect(gitRecord!.payload!.content).toContain("git rebase");

      const errorRecord = results.find((r) => r.summary === "Error Handling Policy");
      expect(errorRecord).toBeDefined();
      expect(errorRecord!.payload!.docType).toBe("behavior-policy");
      expect(errorRecord!.payload!.content).toContain("exponential backoff");
    });

    it("persists across close/reopen cycles", async () => {
      await recalled.storeLongTerm("context", "indexer", "Persistent fact", {
        content: ecpArchContent,
      });
      await recalled.close();

      const longTermStore = await createSqliteMemoryStore({ dataDir, namespace: "integration" });
      const shortTermStore = createInMemoryConversationStore();
      recalled = new Recalled({ longTermStore, shortTermStore });

      const results = await recalled.queryLongTerm("context", {
        executorName: "indexer",
        maxItems: 10,
      });
      expect(results.length).toBe(1);
      expect(results[0].summary).toBe("Persistent fact");
    });

    it("scopes memories correctly (context vs user vs org)", async () => {
      await recalled.storeLongTerm("context", "agent", "Context-scoped memory");
      await recalled.storeLongTerm("user", "agent", "User-scoped memory");
      await recalled.storeLongTerm("org", "agent", "Org-scoped memory");

      const contextResults = await recalled.queryLongTerm("context", { maxItems: 10 });
      expect(contextResults.length).toBe(1);
      expect(contextResults[0].summary).toBe("Context-scoped memory");

      const userResults = await recalled.queryLongTerm("user", { maxItems: 10 });
      expect(userResults.length).toBe(1);
      expect(userResults[0].summary).toBe("User-scoped memory");

      const orgResults = await recalled.queryLongTerm("org", { maxItems: 10 });
      expect(orgResults.length).toBe(1);
      expect(orgResults[0].summary).toBe("Org-scoped memory");
    });

    it("respects token budget when recalling", async () => {
      for (let i = 0; i < 10; i++) {
        await recalled.storeLongTerm(
          "context",
          "indexer",
          `Document ${i}: ${"x".repeat(200)}`,
        );
      }

      const limited = await recalled.queryLongTerm("context", {
        executorName: "indexer",
        maxItems: 10,
        maxTokens: 100,
      });

      expect(limited.length).toBeLessThan(10);
      expect(limited.length).toBeGreaterThan(0);
    });

    it("lists and deletes specific memories", async () => {
      await recalled.storeLongTerm("context", "indexer", "Keep this");
      const r2 = await recalled.storeLongTerm("context", "indexer", "Delete this");

      const listed = await recalled.listLongTerm("context", { executorName: "indexer" });
      expect(listed.length).toBe(2);

      await recalled.deleteLongTerm("context", { id: r2.id });

      const remaining = await recalled.listLongTerm("context", { executorName: "indexer" });
      expect(remaining.length).toBe(1);
      expect(remaining[0].summary).toBe("Keep this");
    });
  });

  describe("short-term memory: conversation recall", () => {
    it("stores and recalls conversation turns", async () => {
      await recalled.addConversationTurn(makeTurn({
        content: "How do I rebase a branch?",
        timestamp: "2024-01-01T00:00:00Z",
      }));
      await recalled.addConversationTurn(makeTurn({
        role: "assistant",
        content: "Use git rebase origin/main after fetching.",
        timestamp: "2024-01-01T00:01:00Z",
      }));
      await recalled.addConversationTurn(makeTurn({
        content: "What about conflicts?",
        timestamp: "2024-01-01T00:02:00Z",
      }));

      const turns = await recalled.queryShortTerm("test-session", { maxTurns: 10 });
      expect(turns.length).toBe(3);
      expect(turns[0].content).toBe("What about conflicts?");
    });

    it("manages prompt state across queries", async () => {
      await recalled.setPromptState({
        stateId: "ps1",
        sessionId: "test-session",
        activeGoal: "Learn git rebase",
        activeEntities: ["git", "rebase", "branch"],
        lastUpdatedAt: new Date().toISOString(),
      });

      const state = await recalled.getPromptState("test-session");
      expect(state).toBeDefined();
      expect(state!.activeGoal).toBe("Learn git rebase");
      expect(state!.activeEntities).toContain("rebase");
    });

    it("clears session state completely", async () => {
      await recalled.addConversationTurn(makeTurn({ content: "Turn 1" }));
      await recalled.addConversationTurn(makeTurn({ content: "Turn 2" }));
      await recalled.setPromptState({
        stateId: "ps1",
        sessionId: "test-session",
        activeGoal: "Testing",
        lastUpdatedAt: new Date().toISOString(),
      });

      await recalled.clearSession("test-session");

      const turns = await recalled.queryShortTerm("test-session");
      expect(turns.length).toBe(0);
      const state = await recalled.getPromptState("test-session");
      expect(state).toBeUndefined();
    });
  });

  describe("hybrid memory: combined recall", () => {
    it("returns both long-term and short-term results in hybrid mode", async () => {
      await recalled.storeLongTerm("context", "indexer", "Git Rebase Skill", {
        docType: "skill",
        content: gitRebaseContent,
      });
      await recalled.storeLongTerm("context", "indexer", "Error Handling Policy", {
        docType: "behavior-policy",
        content: errorHandlingContent,
      });

      await recalled.addConversationTurn(makeTurn({
        content: "I need to rebase my feature branch",
        timestamp: "2024-01-01T00:00:00Z",
      }));
      await recalled.addConversationTurn(makeTurn({
        role: "assistant",
        content: "Let me look up the git rebase procedure for you.",
        timestamp: "2024-01-01T00:01:00Z",
      }));

      const result = await recalled.query("git rebase", {
        mode: "hybrid",
        scope: "context",
        sessionId: "test-session",
        executorName: "indexer",
      });

      expect(result.longTerm.length).toBeGreaterThan(0);
      expect(result.shortTerm.length).toBeGreaterThan(0);
      expect(result.longTerm.some((r) => r.summary.includes("Git Rebase"))).toBe(true);
      expect(result.shortTerm.some((t) => t.content.includes("rebase"))).toBe(true);
    });

    it("respects budget allocation between long-term and short-term", async () => {
      for (let i = 0; i < 5; i++) {
        await recalled.storeLongTerm(
          "context",
          "indexer",
          `Long-term document ${i}: ${"content ".repeat(50)}`,
        );
      }
      for (let i = 0; i < 5; i++) {
        await recalled.addConversationTurn(makeTurn({
          content: `Short-term turn ${i}: ${"conversation ".repeat(30)}`,
          tokenEstimate: 100,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
        }));
      }

      const tightBudget = await recalled.query("documents", {
        mode: "hybrid",
        scope: "context",
        sessionId: "test-session",
        executorName: "indexer",
        budgetTokens: 200,
      });

      expect(tightBudget.longTerm.length).toBeGreaterThan(0);
      expect(tightBudget.longTerm.length).toBeLessThanOrEqual(5);

      const largeBudget = await recalled.query("documents", {
        mode: "hybrid",
        scope: "context",
        sessionId: "test-session",
        executorName: "indexer",
        budgetTokens: 10000,
      });

      expect(largeBudget.longTerm.length).toBeGreaterThanOrEqual(tightBudget.longTerm.length);
    });

    it("long-term only mode excludes short-term results", async () => {
      await recalled.storeLongTerm("context", "indexer", "Long-term fact");
      await recalled.addConversationTurn(makeTurn({ content: "Short-term chat" }));

      const result = await recalled.query("fact", {
        mode: "long-term",
        scope: "context",
        sessionId: "test-session",
        executorName: "indexer",
      });

      expect(result.longTerm.length).toBe(1);
      expect(result.shortTerm.length).toBe(0);
    });

    it("short-term only mode excludes long-term results", async () => {
      await recalled.storeLongTerm("context", "indexer", "Long-term fact");
      await recalled.addConversationTurn(makeTurn({ content: "Short-term chat" }));

      const result = await recalled.query("chat", {
        mode: "short-term",
        sessionId: "test-session",
      });

      expect(result.longTerm.length).toBe(0);
      expect(result.shortTerm.length).toBe(1);
    });
  });
});
