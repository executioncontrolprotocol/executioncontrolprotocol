/**
 * E2E tests for Recalled memory with a real Ollama model.
 *
 * Ingests markdown documents into long-term memory, then asks Ollama
 * questions that require the recalled context to answer correctly.
 * Verifies that memory recall produces relevant context that the model
 * can use to generate accurate responses.
 *
 * These tests auto-skip when Ollama is not available (same pattern as
 * runtime e2e tests). CI runs them in the dedicated e2e job.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Recalled } from "../../src/recalled.js";
import { createSqliteMemoryStore } from "../../src/backends/sqlite/sqlite-memory-store.js";
import { createInMemoryConversationStore } from "../../src/backends/memory/in-memory-conversation-store.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:1b";
const FIXTURES_DIR = join(fileURLToPath(import.meta.url), "../../fixtures");

async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    const models = data.models ?? [];
    return models.some((m) => (m.name ?? m.model) === OLLAMA_MODEL);
  } catch {
    return false;
  }
}

interface OllamaChatResponse {
  message: { content: string };
}

async function askOllama(prompt: string, context: string): Promise<string> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "You are a helpful assistant. Use ONLY the provided context to answer.",
            "If the answer is not in the context, say 'NOT FOUND'.",
            "Be concise and specific.",
            "",
            "## Context (recalled from memory)",
            context,
          ].join("\n"),
        },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  return data.message.content;
}

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

describe("E2E — Recalled memory with Ollama", async () => {
  const available = await isOllamaAvailable();

  beforeAll(() => {
    if (!available) {
      console.log(
        `Skipping Recalled Ollama E2E tests (server not available at ${OLLAMA_BASE_URL})`,
      );
    }
  });

  describe.skipIf(!available)("skill recall", () => {
    let dataDir: string;
    let recalled: Recalled;

    beforeEach(async () => {
      dataDir = mkdtempSync(join(tmpdir(), "recalled-e2e-"));
      const longTermStore = await createSqliteMemoryStore({ dataDir, namespace: "e2e" });
      const shortTermStore = createInMemoryConversationStore();
      recalled = new Recalled({ longTermStore, shortTermStore });
    });

    afterEach(async () => {
      await recalled.close();
      rmSync(dataDir, { recursive: true, force: true });
    });

    it("recalls git rebase steps from ingested skill document", async () => {
      const skillContent = loadFixture("skill-git-rebase.md");
      await recalled.storeLongTerm("context", "indexer", "Git Rebase Skill", {
        docType: "skill",
        content: skillContent,
      });

      const memories = await recalled.queryLongTerm("context", {
        executorName: "indexer",
        maxItems: 5,
        summariesOnly: false,
      });

      expect(memories.length).toBe(1);
      const context = memories
        .map((m) => `${m.summary}\n${m.payload?.content ?? ""}`)
        .join("\n\n");

      const answer = await askOllama(
        "What git command should I use to rebase my branch onto main?",
        context,
      );

      expect(answer.toLowerCase()).toMatch(/rebase/);
      expect(answer.toLowerCase()).toMatch(/origin\/main|main/);
    }, 120_000);

    it("recalls error handling policy from ingested behavior document", async () => {
      const behaviorContent = loadFixture("behavior-error-handling.md");
      await recalled.storeLongTerm("context", "indexer", "Error Handling Policy", {
        docType: "behavior-policy",
        content: behaviorContent,
      });

      const memories = await recalled.queryLongTerm("context", {
        executorName: "indexer",
        maxItems: 5,
        summariesOnly: false,
      });

      const context = memories
        .map((m) => `${m.summary}\n${m.payload?.content ?? ""}`)
        .join("\n\n");

      const answer = await askOllama(
        "What should I do when I get an HTTP 429 rate limit error?",
        context,
      );

      expect(answer.toLowerCase()).toMatch(/retry|backoff|wait/);
    }, 120_000);
  });

  describe.skipIf(!available)("hybrid recall with conversation context", () => {
    let dataDir: string;
    let recalled: Recalled;

    beforeEach(async () => {
      dataDir = mkdtempSync(join(tmpdir(), "recalled-e2e-hybrid-"));
      const longTermStore = await createSqliteMemoryStore({ dataDir, namespace: "e2e-hybrid" });
      const shortTermStore = createInMemoryConversationStore();
      recalled = new Recalled({ longTermStore, shortTermStore });
    });

    afterEach(async () => {
      await recalled.close();
      rmSync(dataDir, { recursive: true, force: true });
    });

    it("combines long-term skill recall with short-term conversation for accurate answers", async () => {
      const skillContent = loadFixture("skill-git-rebase.md");
      await recalled.storeLongTerm("context", "indexer", "Git Rebase Skill", {
        docType: "skill",
        content: skillContent,
      });

      await recalled.addConversationTurn({
        turnId: "t1",
        sessionId: "e2e-session",
        role: "user",
        content: "I have a feature branch called feat/login that is behind main by 10 commits",
        tokenEstimate: 20,
        timestamp: new Date().toISOString(),
        importanceScore: 0.9,
      });

      const result = await recalled.query("rebase", {
        mode: "hybrid",
        scope: "context",
        sessionId: "e2e-session",
        executorName: "indexer",
      });

      expect(result.longTerm.length).toBeGreaterThan(0);
      expect(result.shortTerm.length).toBeGreaterThan(0);

      const longTermContext = result.longTerm
        .map((m) => `${m.summary}\n${m.payload?.content ?? ""}`)
        .join("\n\n");
      const shortTermContext = result.shortTerm
        .map((t) => `[${t.role}] ${t.content}`)
        .join("\n");

      const combinedContext = [
        "## Long-term knowledge",
        longTermContext,
        "",
        "## Recent conversation",
        shortTermContext,
      ].join("\n");

      const answer = await askOllama(
        "Based on our conversation and the skill documentation, what exact git commands should I run to rebase my branch?",
        combinedContext,
      );

      expect(answer.toLowerCase()).toMatch(/rebase/);
      expect(answer.toLowerCase()).toMatch(/git/);
    }, 120_000);

    it("recalls architecture reference and answers factual questions", async () => {
      const archContent = loadFixture("reference-ecp-architecture.md");
      await recalled.storeLongTerm("context", "indexer", "ECP Architecture Reference", {
        docType: "reference",
        content: archContent,
      });

      const memories = await recalled.queryLongTerm("context", {
        executorName: "indexer",
        maxItems: 5,
        summariesOnly: false,
      });

      const context = memories
        .map((m) => `${m.summary}\n${m.payload?.content ?? ""}`)
        .join("\n\n");

      const answer = await askOllama(
        "What are the orchestration strategies available in ECP?",
        context,
      );

      const lower = answer.toLowerCase();
      expect(lower).toMatch(/single|delegate|controller/);
    }, 120_000);
  });
});
