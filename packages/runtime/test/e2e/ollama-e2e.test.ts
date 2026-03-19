/**
 * E2E tests that run the ECP engine with a real Ollama model.
 *
 * These tests require a running Ollama instance with the configured model
 * pulled. They are skipped automatically when Ollama is not available,
 * making them safe to include in any test run.
 *
 * CI runs these in a dedicated job that installs Ollama and pulls the model.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ECPEngine } from "../../src/engine/runner.js";
import { OllamaProvider } from "../../src/providers/ollama/ollama-provider.js";
import { MCPToolInvoker } from "../../src/protocols/mcp/mcp-tool-invoker.js";
import { MockAgentTransport } from "../../src/testing/mock-agent-transport.js";
import type { ECPContext } from "@executioncontrolprotocol/spec";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:1b";

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

function makeSingleExecutorContext(): ECPContext {
  return {
    apiVersion: "ecp/v0.3-draft",
    kind: "Context",
    metadata: {
      name: "ollama-e2e-single",
      version: "1.0.0",
      description: "E2E test: single executor with Ollama",
    },
    inputs: {
      topic: { type: "string", required: true },
    },
    schemas: {
      Summary: {
        type: "object",
        required: ["headline", "body"],
        properties: {
          headline: { type: "string" },
          body: { type: "string" },
        },
      },
    },
    orchestration: {
      entrypoint: "summarizer",
      strategy: "single",
      produces: "Summary",
    },
    executors: [
      {
        name: "summarizer",
        type: "agent",
        model: { provider: "ollama", name: OLLAMA_MODEL },
        instructions: [
          "You are a concise summarizer.",
          "Given a topic, produce a JSON object with exactly these keys:",
          '- "headline": a one-line summary (string)',
          '- "body": a 2-3 sentence explanation (string)',
          "Respond ONLY with the JSON object, no other text.",
        ].join("\n"),
        outputSchemaRef: "#/schemas/Summary",
        mounts: [],
        policies: {
          toolAccess: { default: "deny" },
          budgets: {
            maxToolCalls: 1,
            maxRuntimeSeconds: 120,
          },
          writeControls: { mode: "forbid" },
        },
      },
    ],
  };
}

function makeDelegateContext(): ECPContext {
  return {
    apiVersion: "ecp/v0.3-draft",
    kind: "Context",
    metadata: {
      name: "ollama-e2e-delegate",
      version: "1.0.0",
      description: "E2E test: delegate strategy with Ollama",
    },
    inputs: {
      subject: { type: "string", required: true },
    },
    schemas: {
      Plan: {
        type: "object",
        required: ["delegate"],
        properties: {
          delegate: {
            type: "array",
            items: {
              type: "object",
              required: ["executor", "task"],
              properties: {
                executor: { type: "string" },
                task: { type: "string" },
              },
            },
          },
        },
      },
      Report: {
        type: "object",
        required: ["title", "summary"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
        },
      },
    },
    orchestration: {
      entrypoint: "orchestrator",
      strategy: "delegate",
      produces: "Report",
    },
    executors: [
      {
        name: "orchestrator",
        type: "agent",
        model: { provider: "ollama", name: OLLAMA_MODEL },
        instructions: [
          "You are a research orchestrator. You MUST output valid JSON and nothing else.",
          "Given a subject, output a JSON object with a single key called delegate.",
          "delegate is an array with exactly one item.",
          "Each item has executor (always the string writer) and task (a brief task description).",
          "",
          "Example — if the subject is Solar Energy, output exactly:",
          '{"delegate":[{"executor":"writer","task":"Write a report about Solar Energy"}]}',
          "",
          "Now do the same for the given subject. Output ONLY the JSON object.",
        ].join("\n"),
        outputSchemaRef: "#/schemas/Plan",
        mounts: [],
        policies: {
          toolAccess: { default: "deny" },
          budgets: { maxToolCalls: 1, maxRuntimeSeconds: 120 },
          writeControls: { mode: "forbid" },
        },
      },
      {
        name: "writer",
        type: "agent",
        model: { provider: "ollama", name: OLLAMA_MODEL },
        instructions: [
          "You are a report writer.",
          "Given a task, produce a JSON object with exactly these keys:",
          '- "title": a short title (string)',
          '- "summary": a 2-3 sentence summary (string)',
          "Respond ONLY with the JSON object.",
        ].join("\n"),
        outputSchemaRef: "#/schemas/Report",
        mounts: [],
        policies: {
          toolAccess: { default: "deny" },
          budgets: { maxToolCalls: 1, maxRuntimeSeconds: 120 },
          writeControls: { mode: "forbid" },
        },
      },
    ],
  };
}

describe("E2E — Ollama real model", async () => {
  const available = await isOllamaAvailable();

  beforeAll(() => {
    if (!available) {
      console.log(
        `⏭️  Skipping Ollama E2E tests (server not available at ${OLLAMA_BASE_URL})`,
      );
    }
  });

  describe.skipIf(!available)("single executor", () => {
    it("produces a valid Summary from a topic", async () => {
      const provider = new OllamaProvider({
        baseURL: OLLAMA_BASE_URL,
        defaultModel: OLLAMA_MODEL,
      });

      const engine = new ECPEngine(
        provider,
        new MCPToolInvoker(),
        new MockAgentTransport(),
        { debug: true },
      );

      const result = await engine.run({
        context: makeSingleExecutorContext(),
        inputs: { topic: "The Rust programming language" },
      });

      expect(result.success).toBe(true);
      expect(result.executorOutputs.summarizer).toBeDefined();

      const output = result.executorOutputs.summarizer;
      expect(output).toHaveProperty("headline");
      expect(output).toHaveProperty("body");
      expect(typeof output.headline).toBe("string");
      expect(typeof output.body).toBe("string");
      expect((output.headline as string).length).toBeGreaterThan(0);
      expect((output.body as string).length).toBeGreaterThan(0);
    }, 120_000);
  });

  describe.skipIf(!available)("delegate strategy", () => {
    it("orchestrator delegates to writer and produces a Report", { retry: 2, timeout: 120_000 }, async () => {
      const provider = new OllamaProvider({
        baseURL: OLLAMA_BASE_URL,
        defaultModel: OLLAMA_MODEL,
      });

      const engine = new ECPEngine(
        provider,
        new MCPToolInvoker(),
        new MockAgentTransport(),
        { debug: true },
      );

      const result = await engine.run({
        context: makeDelegateContext(),
        inputs: { subject: "Climate change" },
      });

      expect(result.success).toBe(true);

      expect(result.executorOutputs.orchestrator).toBeDefined();
      const plan = result.executorOutputs.orchestrator;
      expect(plan).toHaveProperty("delegate");
      expect(Array.isArray(plan.delegate)).toBe(true);

      expect(result.executorOutputs.writer).toBeDefined();
      const report = result.executorOutputs.writer;
      expect(report).toHaveProperty("title");
      expect(report).toHaveProperty("summary");
      expect(typeof report.title).toBe("string");
      expect(typeof report.summary).toBe("string");
    });
  });
});
