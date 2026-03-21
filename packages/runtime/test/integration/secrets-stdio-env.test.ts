import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { ECPEngine } from "../../src/engine/runner.js";
import { MCPToolInvoker } from "../../src/protocols/mcp/mcp-tool-invoker.js";
import { MockAgentTransport } from "../../src/testing/mock-agent-transport.js";
import { MockModelProvider } from "../../src/testing/mock-model-provider.js";
import { createDefaultSecretBroker } from "../../src/secrets/builtin.js";
import { ENV_PROVIDER_ID } from "../../src/secrets/provider-ids.js";
import type { ECPContext } from "@executioncontrolprotocol/spec";

const ENV_ECHO_SERVER_PATH = resolve(
  import.meta.dirname,
  "servers/env-echo-mcp-server.ts",
);

function makeSecretsContext(): ECPContext {
  return {
    apiVersion: "ecp/v0.3-draft",
    kind: "Context",
    metadata: {
      name: "secrets-stdio-env-integration",
      version: "1.0.0",
      description: "Integration test: secrets merged into stdio MCP env",
    },
    inputs: {},
    orchestration: {
      entrypoint: "agent",
      strategy: "single",
    },
    executors: [
      {
        name: "agent",
        type: "agent",
        model: { provider: "mock", name: "mock" },
        instructions: [
          "Use the env.get tool to read ECP_TEST_SECRET_ENV_VAR.",
          "Output the value as JSON: {\"secret\": string}.",
        ].join("\n"),
        mounts: [],
        policies: {
          toolAccess: {
            default: "deny",
            allow: ["test-env:env.get"],
          },
          budgets: { maxToolCalls: 2, maxRuntimeSeconds: 30 },
          writeControls: { mode: "forbid" },
        },
      },
    ],
  };
}

describe("Secrets integration — stdio env merge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("merges secret bindings into stdio transport env", async () => {
    // Set up secret in env provider
    vi.stubEnv("ECP_TEST_SECRET_ENV_VAR", "secret-value-from-env");

    const { broker } = createDefaultSecretBroker({ policy: "permissive" });

    const model = new MockModelProvider()
      .addToolCallResponse([
        {
          id: "call_0",
          name: "test-env:env.get",
          arguments: { name: "ECP_TEST_SECRET_ENV_VAR" },
        },
      ])
      .addJsonResponse({ secret: "secret-value-from-env" });

    const toolInvoker = new MCPToolInvoker();
    const engine = new ECPEngine(model, toolInvoker, new MockAgentTransport(), {
      debug: false,
      secretBroker: broker,
      toolServers: {
        "test-env": {
          transport: {
            type: "stdio",
            command: "npx",
            args: ["tsx", ENV_ECHO_SERVER_PATH],
          },
          credentials: {
            bindings: [
              {
                name: "ECP_TEST_SECRET_ENV_VAR",
                source: { provider: ENV_PROVIDER_ID, key: "ECP_TEST_SECRET_ENV_VAR" },
                required: true,
                delivery: "env",
              },
            ],
          },
        },
      },
    });

    const result = await engine.run({
      context: makeSecretsContext(),
      inputs: {},
    });

    expect(result.success).toBe(true);
    expect(result.executorOutputs.agent).toEqual({ secret: "secret-value-from-env" });

    // Verify the tool was called and received the secret
    const toolCalls = model.calls.filter((c) => c.tools?.some((t) => t.name === "test-env:env.get"));
    expect(toolCalls.length).toBeGreaterThan(0);

    const toolMessages = model.calls
      .flatMap((c) => c.messages)
      .filter((m) => m.role === "tool");
    expect(toolMessages.length).toBeGreaterThan(0);
    const toolResponse = JSON.parse(toolMessages[0]!.content as string);
    expect(toolResponse.value).toBe("secret-value-from-env");
  }, 30_000);
});
