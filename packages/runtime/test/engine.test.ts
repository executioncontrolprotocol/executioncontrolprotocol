import { describe, it, expect, beforeEach } from "vitest";
import { resolve } from "node:path";
import { ECPEngine } from "../src/engine/runner.js";
import { MockModelProvider } from "../src/testing/mock-model-provider.js";
import { MockToolInvoker } from "../src/testing/mock-tool-invoker.js";
import { MockAgentTransport } from "../src/testing/mock-agent-transport.js";
import { loadContext } from "../src/engine/context-loader.js";
import type { ECPContext } from "@ecp/spec";
import type { GenerateOptions, GenerateResult, ModelProvider } from "../src/providers/model-provider.js";
import { ExtensionRegistry } from "../src/extensions/registry.js";

const singleExecutorCtx = resolve(
  import.meta.dirname,
  "../../spec/test/fixtures/valid/minimal.yaml",
);

const fullCtx = resolve(
  import.meta.dirname,
  "../../spec/test/fixtures/valid/full-featured.yaml",
);

describe("ECPEngine — single executor (Slice 1)", () => {
  let model: MockModelProvider;
  let tools: MockToolInvoker;
  let transport: MockAgentTransport;

  beforeEach(() => {
    model = new MockModelProvider();
    tools = new MockToolInvoker();
    transport = new MockAgentTransport();
  });

  it("runs a minimal context and returns the model output", async () => {
    model.addJsonResponse({ headline: "Test", body: "Works" });

    const engine = new ECPEngine(model, tools, transport);
    const result = await engine.run({ contextPath: singleExecutorCtx });

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(model.calls).toHaveLength(1);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("records context metadata in the result", async () => {
    model.addJsonResponse({ result: "ok" });

    const engine = new ECPEngine(model, tools, transport);
    const result = await engine.run({ contextPath: singleExecutorCtx });

    expect(result.contextName).toBe("minimal");
    expect(result.contextVersion).toBe("1.0.0");
    expect(result.runId).toMatch(/^run-/);
  });

  it("passes executor instructions as system message", async () => {
    const ctx = loadContext(singleExecutorCtx);
    ctx.executors[0].instructions = "You are a concise summarizer.";
    model.addJsonResponse({ headline: "ECP", body: "A protocol" });

    const engine = new ECPEngine(model, tools, transport);
    await engine.run({ context: ctx });

    const firstCall = model.calls[0];
    expect(firstCall).toBeDefined();
    const systemMsg = firstCall.messages.find((m) => m.role === "system");
    expect(systemMsg?.content).toContain("concise summarizer");
  });

  it("accepts a pre-loaded context object", async () => {
    const ctx = loadContext(singleExecutorCtx);
    model.addJsonResponse({ done: true });

    const engine = new ECPEngine(model, tools, transport);
    const result = await engine.run({ context: ctx });

    expect(result.success).toBe(true);
  });
});

describe("ECPEngine — delegate strategy (Slice 2)", () => {
  let model: MockModelProvider;
  let tools: MockToolInvoker;
  let transport: MockAgentTransport;

  beforeEach(() => {
    model = new MockModelProvider();
    tools = new MockToolInvoker();
    transport = new MockAgentTransport();
  });

  it("runs orchestrator → specialists → merger", async () => {
    model
      .addJsonResponse({
        selectedIds: ["A"],
        delegate: [
          { executor: "analyst", task: "Analyze A" },
        ],
      })
      .addJsonResponse({ summary: "Analysis of A", keyPoints: [] })
      .addJsonResponse({ title: "Report", body: "Final merged report" });

    const engine = new ECPEngine(model, tools, transport);
    const result = await engine.run({
      contextPath: fullCtx,
      inputs: { projectId: "PROJ-1" },
    });

    expect(result.success).toBe(true);
    expect(model.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.executorOutputs).toHaveProperty("orchestrator");
  });

  it("handles empty delegation list gracefully", async () => {
    model.addJsonResponse({ selectedIds: [], delegate: [] });

    const engine = new ECPEngine(model, tools, transport);
    const result = await engine.run({
      contextPath: fullCtx,
      inputs: { projectId: "PROJ-1" },
    });

    expect(result.success).toBe(true);
    expect(result.log.some((e) => e.message.includes("No delegations"))).toBe(true);
  });

  it("hydrates seed mounts before orchestrator runs", async () => {
    tools.addSimpleTool("jira", "issues.search", [
      { id: "ISS-1" },
      { id: "ISS-2" },
    ]);

    model.addJsonResponse({ selectedIds: [], delegate: [] });

    const engine = new ECPEngine(model, tools, transport, {
      toolServers: {
        jira: { transport: { type: "mock" } },
      },
    });

    const result = await engine.run({
      contextPath: fullCtx,
      inputs: { projectId: "PROJ-1" },
    });

    expect(result.success).toBe(true);
    const userMsg = model.calls[0].messages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("seed_data");
  });

  it("delegates via A2A when agent endpoints are configured", async () => {
    model.addJsonResponse({
      selectedIds: [],
      delegate: [{ executor: "analyst", task: "Analyze" }],
    });

    transport.addResponse("analyst", {
      output: { summary: "A2A result", keyPoints: [] },
    });

    model.addJsonResponse({ title: "Report", body: "Merged" });

    const engine = new ECPEngine(model, tools, transport, {
      agentEndpoints: { analyst: "http://localhost:9999" },
    });

    const result = await engine.run({
      contextPath: fullCtx,
      inputs: { projectId: "PROJ-1" },
    });

    expect(result.success).toBe(true);
    expect(transport.delegations).toHaveLength(1);
    expect(transport.delegations[0].task.executorName).toBe("analyst");
  });
});

describe("ECPEngine — tool calling loop", () => {
  let model: MockModelProvider;
  let tools: MockToolInvoker;
  let transport: MockAgentTransport;

  beforeEach(() => {
    model = new MockModelProvider();
    tools = new MockToolInvoker();
    transport = new MockAgentTransport();
  });

  it("executes tool calls and feeds results back to model", async () => {
    tools.addSimpleTool("jira", "issues.search", [{ id: "ISS-1" }]);

    model
      .addToolCallResponse([
        {
          id: "call-1",
          name: "jira:issues.search",
          arguments: { project: "OPS" },
        },
      ])
      .addJsonResponse({ result: "done with tool data" });

    const ctx = loadContext(
      resolve(import.meta.dirname, "../../spec/test/fixtures/valid/minimal.yaml"),
    );
    ctx.executors[0].policies = {
      toolAccess: { default: "deny", allow: ["jira:issues.search"] },
    };

    const engine = new ECPEngine(model, tools, transport, {
      toolServers: { jira: { transport: { type: "mock" } } },
    });

    const result = await engine.run({ context: ctx });

    expect(result.success).toBe(true);
    expect(model.calls).toHaveLength(2);
    expect(tools.calls).toHaveLength(1);
    expect(result.totalBudgetUsage.toolCalls).toBe(1);
  });

  it("denies tool calls not in the allowlist", async () => {
    model
      .addToolCallResponse([
        {
          id: "call-1",
          name: "dangerous:nuke",
          arguments: {},
        },
      ])
      .addJsonResponse({ result: "continued after denial" });

    const ctx = loadContext(singleExecutorCtx);
    ctx.executors[0].policies = {
      toolAccess: { default: "deny", allow: ["jira:issues.search"] },
    };

    const engine = new ECPEngine(model, tools, transport);
    const result = await engine.run({ context: ctx });

    expect(result.success).toBe(true);
    expect(tools.calls).toHaveLength(0);
    expect(result.log.some((e) => e.message.includes("denied"))).toBe(true);
  });
});

class StaticProvider implements ModelProvider {
  readonly name: string;
  private readonly output: Record<string, unknown>;

  constructor(name: string, output: Record<string, unknown>) {
    this.name = name;
    this.output = output;
  }

  supportsToolCalling(): boolean {
    return false;
  }

  async generate(_options: GenerateOptions): Promise<GenerateResult> {
    return {
      content: JSON.stringify(this.output),
      toolCalls: [],
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    };
  }
}

function makeExtensibleContext(providerName: string): ECPContext {
  return {
    apiVersion: "ecp/v0.3-draft",
    kind: "Context",
    metadata: { name: "extensible", version: "1.0.0" },
    schemas: {
      Result: {
        type: "object",
        required: ["provider"],
        properties: {
          provider: { type: "string" },
        },
      },
    },
    orchestration: {
      entrypoint: "agent",
      strategy: "single",
      produces: "Result",
    },
    extensions: {
      version: "1.0.0",
      providers: [
        {
          name: providerName,
          kind: "model-provider",
          type: "builtin",
          version: "1.0.0",
        },
      ],
      enable: [providerName],
      security: {
        enabled: true,
        allowKinds: ["model-provider"],
        allowSourceTypes: ["builtin"],
      },
    },
    executors: [
      {
        name: "agent",
        type: "agent",
        model: {
          provider: {
            name: providerName,
            type: "builtin",
            version: "1.0.0",
          },
          name: "dummy-model",
        },
        outputSchemaRef: "#/schemas/Result",
      },
    ],
  };
}

describe("ECPEngine — extensibility registry", () => {
  it("resolves executor provider from extension registry", async () => {
    const fallbackModel = new MockModelProvider();
    const tools = new MockToolInvoker();
    const transport = new MockAgentTransport();
    const registry = new ExtensionRegistry();

    registry.registerModelProvider({
      id: "provider-a",
      kind: "model-provider",
      sourceType: "builtin",
      version: "1.0.0",
      create() {
        return new StaticProvider("provider-a", { provider: "provider-a" });
      },
    });
    registry.lock();

    const engine = new ECPEngine(fallbackModel, tools, transport, {
      extensions: {
        registry,
      },
    });

    const result = await engine.run({
      context: makeExtensibleContext("provider-a"),
    });

    expect(result.success).toBe(true);
    expect(result.executorOutputs.agent.provider).toBe("provider-a");
    expect(fallbackModel.calls).toHaveLength(0);
  });

  it("denies provider loading when source type is disallowed by system policy", async () => {
    const fallbackModel = new MockModelProvider();
    const tools = new MockToolInvoker();
    const transport = new MockAgentTransport();
    const registry = new ExtensionRegistry();

    registry.registerModelProvider({
      id: "provider-a",
      kind: "model-provider",
      sourceType: "builtin",
      version: "1.0.0",
      create() {
        return new StaticProvider("provider-a", { provider: "provider-a" });
      },
    });
    registry.lock();

    const engine = new ECPEngine(fallbackModel, tools, transport, {
      extensions: {
        registry,
        security: {
          enabled: true,
          allowSourceTypes: ["npm"],
        },
      },
    });

    const result = await engine.run({
      context: makeExtensibleContext("provider-a"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("source type");
  });
});
