import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { ECPEngine } from "../../src/engine/runner.js";
import { MockModelProvider } from "../../src/testing/mock-model-provider.js";
import { MCPToolInvoker } from "../../src/protocols/mcp/mcp-tool-invoker.js";
import { MockAgentTransport } from "../../src/testing/mock-agent-transport.js";
import type { ECPContext } from "@executioncontrolprotocol/spec";

const FAKE_SERVER_PATH = resolve(
  import.meta.dirname,
  "servers/fake-mcp-server.ts",
);

function makeContext(): ECPContext {
  return {
    specVersion: "ecp/v0.3-draft",
    kind: "Context",
    metadata: { name: "e2e-test", version: "1.0.0" },
    inputs: { projectId: { type: "string", required: true } },
    schemas: {
      Plan: {
        type: "object",
        required: ["selectedIds", "delegate"],
        properties: {
          selectedIds: { type: "array", items: { type: "string" } },
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
      Findings: {
        type: "object",
        required: ["summary"],
        properties: { summary: { type: "string" } },
      },
    },
    orchestration: {
      entrypoint: "orchestrator",
      strategy: "delegate",
      requires: ["Findings"],
    },
    executors: [
      {
        name: "orchestrator",
        type: "agent",
        outputSchemaRef: "#/schemas/Plan",
        mounts: [
          {
            name: "issues_seed",
            stage: "seed",
            from: {
              server: "jira",
              tool: "issues.search",
              args: { project: "${inputs.projectId}", limit: 3 },
            },
            limits: { maxItems: 3 },
          },
        ],
        policies: {
          toolAccess: { default: "deny", allow: ["jira:issues.search"] },
        },
      },
      {
        name: "analyst",
        type: "agent",
        outputSchemaRef: "#/schemas/Findings",
        mounts: [
          {
            name: "issue_detail",
            stage: "focus",
            when: { selectorFrom: "selectedIds", maxSelected: 2 },
            from: {
              server: "jira",
              tool: "issues.get",
              args: { issueId: "${item}" },
            },
          },
        ],
        policies: {
          toolAccess: { default: "deny", allow: ["jira:issues.get"] },
        },
      },
    ],
  };
}

describe("Engine E2E — real MCP, mock model", () => {
  it("runs a full delegate flow with real MCP server", async () => {
    const model = new MockModelProvider();
    const toolInvoker = new MCPToolInvoker();
    const transport = new MockAgentTransport();

    model
      .addJsonResponse({
        selectedIds: ["ISS-1", "ISS-2"],
        delegate: [{ executor: "analyst", task: "Analyze top issues" }],
      })
      .addJsonResponse({ summary: "ISS-1 is a high-priority login bug, ISS-2 is a feature request" });

    const engine = new ECPEngine(model, toolInvoker, transport, {
      toolServers: {
        jira: {
          transport: {
            type: "stdio",
            command: "npx",
            args: ["tsx", FAKE_SERVER_PATH],
          },
        },
      },
      debug: false,
    });

    const result = await engine.run({
      context: makeContext(),
      inputs: { projectId: "TEST" },
    });

    expect(result.success).toBe(true);

    expect(result.executorOutputs.orchestrator).toBeDefined();
    expect(result.executorOutputs.orchestrator.selectedIds).toEqual(["ISS-1", "ISS-2"]);

    expect(result.executorOutputs.analyst).toBeDefined();
    const analystOutput = JSON.stringify(result.executorOutputs.analyst);
    expect(analystOutput).toContain("login bug");

    expect(model.calls.length).toBe(2);

    const orchestratorUserMsg = model.calls[0].messages.find((m) => m.role === "user");
    expect(orchestratorUserMsg?.content).toContain("issues_seed");
    expect(orchestratorUserMsg?.content).toContain("ISS-1");

    const analystUserMsg = model.calls[1].messages.find((m) => m.role === "user");
    expect(analystUserMsg?.content).toContain("issue_detail");
  }, 15000);
});
