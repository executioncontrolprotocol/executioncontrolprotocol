import { describe, expect, it, vi } from "vitest";

import { resolveStdioEnvForToolServer } from "../../src/secrets/mcp-env.js";
import type { SecretBroker, ToolServerCredentialBinding } from "@executioncontrolprotocol/plugins";
import { buildMinimalStdioEnv } from "../../src/secrets/minimal-env.js";
import { ENV_PROVIDER_ID } from "../../src/secrets/provider-ids.js";

describe("resolveStdioEnvForToolServer", () => {
  it("returns unchanged transport for non-stdio transport", async () => {
    const mockBroker = {
      resolveBindingsToEnv: vi.fn(),
    } as unknown as SecretBroker;

    const server = {
      transport: {
        type: "http",
        url: "https://example.com",
        env: { EXISTING: "value" },
      },
    };

    const result = await resolveStdioEnvForToolServer(mockBroker, server);
    expect(result.transport).toEqual(server.transport);
    expect(result.warnings).toEqual([]);
    expect(mockBroker.resolveBindingsToEnv).not.toHaveBeenCalled();
  });

  it("returns unchanged transport for stdio without bindings", async () => {
    const mockBroker = {
      resolveBindingsToEnv: vi.fn(),
    } as unknown as SecretBroker;

    const server = {
      transport: {
        type: "stdio",
        command: "node",
        args: ["script.js"],
        env: { EXISTING: "value" },
      },
    };

    const result = await resolveStdioEnvForToolServer(mockBroker, server);
    expect(result.transport).toEqual(server.transport);
    expect(result.warnings).toEqual([]);
    expect(mockBroker.resolveBindingsToEnv).not.toHaveBeenCalled();
  });

  it("returns unchanged transport for stdio with empty bindings array", async () => {
    const mockBroker = {
      resolveBindingsToEnv: vi.fn(),
    } as unknown as SecretBroker;

    const server = {
      transport: {
        type: "stdio",
        command: "node",
      },
      credentials: {
        bindings: [],
      },
    };

    const result = await resolveStdioEnvForToolServer(mockBroker, server);
    expect(result.transport).toEqual(server.transport);
    expect(result.warnings).toEqual([]);
    expect(mockBroker.resolveBindingsToEnv).not.toHaveBeenCalled();
  });

  it("merges minimal env, existing env, and secret env in correct order", async () => {
    const bindings: ToolServerCredentialBinding[] = [
      {
        name: "SECRET_TOKEN",
        source: { provider: ENV_PROVIDER_ID, key: "ECP_TEST_TOKEN" },
        required: true,
        delivery: "env",
      },
    ];

    const mockBroker = {
      resolveBindingsToEnv: vi.fn().mockResolvedValue({
        env: { SECRET_TOKEN: "secret-value" },
        warnings: [],
      }),
    } as unknown as SecretBroker;

    const server = {
      transport: {
        type: "stdio",
        command: "node",
        args: ["script.js"],
        env: {
          EXISTING: "existing-value",
          PATH: "/custom/path",
        },
      },
      credentials: {
        bindings,
      },
    };

    const result = await resolveStdioEnvForToolServer(mockBroker, server);
    expect(mockBroker.resolveBindingsToEnv).toHaveBeenCalledWith(bindings);

    const minimal = buildMinimalStdioEnv();
    expect(result.transport.env).toEqual({
      ...minimal,
      EXISTING: "existing-value",
      PATH: "/custom/path",
      SECRET_TOKEN: "secret-value",
    });
    expect(result.warnings).toEqual([]);
  });

  it("preserves minimal env keys even when overridden by existing or secrets", async () => {
    const bindings: ToolServerCredentialBinding[] = [
      {
        name: "PATH",
        source: { provider: ENV_PROVIDER_ID, key: "ECP_TEST_PATH" },
        required: true,
        delivery: "env",
      },
    ];

    const mockBroker = {
      resolveBindingsToEnv: vi.fn().mockResolvedValue({
        env: { PATH: "/secret/path" },
        warnings: [],
      }),
    } as unknown as SecretBroker;

    const server = {
      transport: {
        type: "stdio",
        command: "node",
        env: {
          PATH: "/existing/path",
        },
      },
      credentials: {
        bindings,
      },
    };

    const result = await resolveStdioEnvForToolServer(mockBroker, server);
    // Secret env should win (last in merge order)
    expect(result.transport.env.PATH).toBe("/secret/path");
    // But minimal keys should still be present if they exist in process.env
    const minimal = buildMinimalStdioEnv();
    for (const key of Object.keys(minimal)) {
      if (key !== "PATH") {
        expect(result.transport.env[key]).toBe(minimal[key]);
      }
    }
  });

  it("propagates warnings from broker", async () => {
    const bindings: ToolServerCredentialBinding[] = [
      {
        name: "TOKEN",
        source: { provider: ENV_PROVIDER_ID, key: "ECP_TEST_TOKEN" },
        required: true,
        delivery: "env",
      },
    ];

    const mockBroker = {
      resolveBindingsToEnv: vi.fn().mockResolvedValue({
        env: { TOKEN: "value" },
        warnings: ["Warning: insecure provider"],
      }),
    } as unknown as SecretBroker;

    const server = {
      transport: {
        type: "stdio",
        command: "node",
      },
      credentials: {
        bindings,
      },
    };

    const result = await resolveStdioEnvForToolServer(mockBroker, server);
    expect(result.warnings).toEqual(["Warning: insecure provider"]);
  });

  it("handles missing env in transport", async () => {
    const bindings: ToolServerCredentialBinding[] = [
      {
        name: "TOKEN",
        source: { provider: ENV_PROVIDER_ID, key: "ECP_TEST_TOKEN" },
        required: true,
        delivery: "env",
      },
    ];

    const mockBroker = {
      resolveBindingsToEnv: vi.fn().mockResolvedValue({
        env: { TOKEN: "value" },
        warnings: [],
      }),
    } as unknown as SecretBroker;

    const server = {
      transport: {
        type: "stdio",
        command: "node",
      },
      credentials: {
        bindings,
      },
    };

    const result = await resolveStdioEnvForToolServer(mockBroker, server);
    const minimal = buildMinimalStdioEnv();
    expect(result.transport.env).toEqual({
      ...minimal,
      TOKEN: "value",
    });
  });
});
