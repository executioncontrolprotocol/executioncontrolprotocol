import { describe, expect, it } from "vitest";

import {
  assertHostPolicyForContext,
  assertPluginSecurityPolicyForContext,
  collectModelProviderIdsFromContext,
  modelProviderIdFromConfig,
} from "../src/engine/host-policy.js";
import type { ECPContext } from "@executioncontrolprotocol/spec";
import type { ECPSystemConfig } from "../src/engine/types.js";

function minimalContext(overrides: Partial<ECPContext> = {}): ECPContext {
  return {
    specVersion: "ecp/v0.5-draft",
    kind: "Context",
    metadata: { name: "t", version: "1.0.0" },
    orchestration: { strategy: "single" },
    orchestrator: {
      name: "o",
      type: "agent",
      model: { provider: "openai", name: "gpt-4o-mini" },
      executors: [],
    },
    schemas: {},
    ...overrides,
  } as ECPContext;
}

describe("modelProviderIdFromConfig / collectModelProviderIdsFromContext", () => {
  it("resolves string provider id", () => {
    expect(modelProviderIdFromConfig({ provider: "openai", name: "gpt-4o-mini" })).toBe("openai");
  });

  it("resolves structured provider ref", () => {
    expect(
      modelProviderIdFromConfig({
        provider: { name: "ollama", type: "builtin", version: "0.3.0" },
        name: "gemma3:1b",
      }),
    ).toBe("ollama");
  });

  it("collects orchestrator and leaf executor providers", () => {
    const ctx = minimalContext({
      orchestrator: {
        name: "o",
        type: "agent",
        model: { provider: "openai", name: "gpt-4o-mini" },
        executors: [
          {
            name: "e",
            type: "agent",
            model: { provider: "ollama", name: "gemma3:1b" },
          },
        ],
      },
    });
    expect(collectModelProviderIdsFromContext(ctx)).toEqual(["ollama", "openai"]);
  });
});

describe("assertHostPolicyForContext", () => {
  it("throws when models.providers omits a provider referenced by the Context", () => {
    const ctx = {
      ...minimalContext(),
      orchestrator: undefined,
      executors: [
        {
          name: "campaign_creator",
          type: "agent",
          model: {
            provider: { name: "ollama", type: "builtin", version: "0.3.0" },
            name: "llama3.2:3b",
          },
          instructions: "x",
        },
      ],
    } as ECPContext;
    const cfg: ECPSystemConfig = {
      version: "0.5",
      security: {
        models: { allowProviders: ["ollama"] },
        tools: {},
        executors: {},
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {},
      },
      models: {
        providers: {
          openai: { defaultModel: "gpt-4o-mini", supportedModels: ["gpt-4o-mini"] },
        },
      },
    };
    expect(() =>
      assertHostPolicyForContext(ctx, cfg, {
        providerId: "ollama",
        loggersEnabled: [],
      }),
    ).toThrow(/not configured in system config under models\.providers/);
  });

  it("throws when mount references unknown MCP server", () => {
    const ctx = minimalContext({
      orchestrator: {
        name: "o",
        type: "agent",
        model: { provider: "openai", name: "gpt-4o-mini" },
        mounts: [
          {
            name: "m",
            stage: "seed",
            from: { server: "missing", tool: "x" },
          },
        ],
        executors: [],
      },
    });
    const cfg: ECPSystemConfig = {
      models: {
        providers: {
          openai: { defaultModel: "gpt-4o-mini", supportedModels: ["gpt-4o-mini"] },
        },
      },
    };
    expect(() =>
      assertHostPolicyForContext(ctx, cfg, {
        providerId: "openai",
        loggersEnabled: [],
      }),
    ).toThrow(/tools\.servers/);
  });

  it("throws when MCP server not in allowServers", () => {
    const ctx = minimalContext({
      orchestrator: {
        name: "o",
        type: "agent",
        model: { provider: "openai", name: "gpt-4o-mini" },
        mounts: [
          {
            name: "m",
            stage: "seed",
            from: { server: "srv", tool: "x" },
          },
        ],
        executors: [],
      },
    });
    const cfg: ECPSystemConfig = {
      models: {
        providers: {
          openai: { defaultModel: "gpt-4o-mini", supportedModels: ["gpt-4o-mini"] },
        },
      },
      tools: {
        servers: {
          srv: { transport: { type: "stdio", command: "npx", args: [] } },
        },
      },
      security: {
        models: {},
        tools: { allowServers: ["other"] },
        executors: {},
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {},
      },
    };
    expect(() =>
      assertHostPolicyForContext(ctx, cfg, {
        providerId: "openai",
        loggersEnabled: [],
      }),
    ).toThrow(/security\.tools\.allowServers/);
  });

  it("passes when wiring and allow list include referenced server", () => {
    const ctx = minimalContext({
      orchestrator: {
        name: "o",
        type: "agent",
        model: { provider: "openai", name: "gpt-4o-mini" },
        mounts: [
          {
            name: "m",
            stage: "seed",
            from: { server: "srv", tool: "x" },
          },
        ],
        executors: [],
      },
    });
    const cfg: ECPSystemConfig = {
      models: {
        providers: {
          openai: { defaultModel: "gpt-4o-mini", supportedModels: ["gpt-4o-mini"] },
        },
      },
      tools: {
        servers: {
          srv: { transport: { type: "stdio", command: "npx", args: [] } },
        },
      },
      security: {
        models: {},
        tools: { allowServers: ["srv"] },
        executors: {},
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {},
      },
    };
    expect(() =>
      assertHostPolicyForContext(ctx, cfg, {
        providerId: "openai",
        loggersEnabled: [],
      }),
    ).not.toThrow();
  });

  it("throws when Context plugin reference is not allow-listed", () => {
    const ctx = {
      ...minimalContext(),
      plugins: {
        version: "1",
        providers: [{ name: "custom", kind: "provider" as const, type: "npm" as const, version: "1.0.0" }],
      },
    } as ECPContext;
    expect(() =>
      assertHostPolicyForContext(
        ctx,
        {
          version: "0.5",
          models: { providers: { openai: { defaultModel: "gpt-4o-mini", supportedModels: ["gpt-4o-mini"] } } },
          security: {
            models: { allowProviders: ["openai"] },
            tools: {},
            executors: {},
            memory: {},
            agents: {},
            loggers: {},
            secrets: {},
            plugins: { allowIds: ["openai"] },
          },
        },
        { providerId: "openai", loggersEnabled: [] },
      ),
    ).toThrow(/security\.plugins\.allowIds/);
  });
});

describe("assertPluginSecurityPolicyForContext", () => {
  it("throws for structured model provider ref when allowIds excludes it", () => {
    const ctx = {
      specVersion: "ecp/v0.5-draft",
      kind: "Context",
      metadata: { name: "t", version: "1.0.0" },
      orchestration: { strategy: "single" },
      orchestrator: {
        name: "o",
        type: "agent",
        model: { provider: { name: "ollama", type: "builtin", version: "0.3.0" }, name: "gemma3:1b" },
        executors: [],
      },
      schemas: {},
    } as ECPContext;
    expect(() =>
      assertPluginSecurityPolicyForContext(ctx, {
        allowIds: ["openai"],
      }),
    ).toThrow(/model provider/);
  });
});

