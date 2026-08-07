import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { ECPEngine } from "../../src/engine/runner.js";
import { MCPToolInvoker } from "../../src/protocols/mcp/mcp-tool-invoker.js";
import { MockAgentTransport } from "../../src/testing/mock-agent-transport.js";
import { MockModelProvider } from "../../src/testing/mock-model-provider.js";
import type { ECPContext } from "@executioncontrolprotocol/spec";

const FAKE_SERVER_PATH = resolve(
  import.meta.dirname,
  "servers/fake-mcp-server.ts",
);

function makeToolCallingContext(): ECPContext {
  return {
    specVersion: "ecp/v0.5-draft",
    kind: "Context",
    metadata: {
      name: "mcp-toolcalling-engine-integration",
      version: "1.0.0",
      description: "Integration test: model tool-calls routed via MCP server",
    },
    inputs: {
      project: { type: "string", required: true },
    },
    schemas: {
      Result: {
        type: "object",
        required: ["ids"],
        properties: {
          ids: { type: "array", items: { type: "string" } },
        },
      },
    },
    orchestration: {
      entrypoint: "agent",
      strategy: "single",
      produces: "Result",
    },
    executors: [
      {
        name: "agent",
        type: "agent",
        model: { provider: "mock", name: "mock" },
        instructions: [
          "You must use the provided tools to search issues.",
          "Output ONLY JSON: {\"ids\": string[]}.",
        ].join("\n"),
        outputSchemaRef: "#/schemas/Result",
        mounts: [],
        policies: {
          toolAccess: {
            default: "deny",
            allow: ["test-jira:issues.search"],
          },
          budgets: { maxToolCalls: 3, maxRuntimeSeconds: 30 },
          writeControls: { mode: "forbid" },
        },
      },
    ],
  };
}

describe("Engine integration — tool-calling via MCP", () => {
  it("routes model tool-calls to MCP server and feeds results back", async () => {
    const model = new MockModelProvider()
      .addToolCallResponse([
        {
          id: "call_0",
          name: "test-jira:issues.search",
          arguments: { project: "OPS", limit: 2 },
        },
      ])
      .addJsonResponse({ ids: ["ISS-1", "ISS-2"] });

    const toolInvoker = new MCPToolInvoker();
    const engine = new ECPEngine(model, toolInvoker, new MockAgentTransport(), {
      debug: false,
      toolServers: {
        "test-jira": {
          transport: {
            type: "stdio",
            command: "npx",
            args: ["tsx", FAKE_SERVER_PATH],
          },
        },
      },
    });

    const result = await engine.run({
      context: makeToolCallingContext(),
      inputs: { project: "OPS" },
    });

    expect(result.success).toBe(true);
    expect(result.totalBudgetUsage.toolCalls).toBe(1);
    expect(result.executorOutputs.agent).toEqual({ ids: ["ISS-1", "ISS-2"] });

    // The engine should have passed tool definitions to the model on the first call.
    expect(model.calls.length).toBeGreaterThanOrEqual(2);
    const firstCall = model.calls[0]!;
    expect(firstCall.tools?.some((t) => t.name === "test-jira:issues.search")).toBe(
      true,
    );

    // The second call should include a tool message containing the MCP result.
    const secondCall = model.calls[1]!;
    const toolMsgs = secondCall.messages.filter((m) => m.role === "tool");
    expect(toolMsgs.length).toBeGreaterThanOrEqual(1);
    expect(toolMsgs[0]!.content).toContain("ISS-1");
    expect(toolMsgs[0]!.content).toContain("ISS-2");
  }, 30_000);
});

