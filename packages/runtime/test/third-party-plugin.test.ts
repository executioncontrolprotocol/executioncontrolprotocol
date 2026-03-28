import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ExtensionRegistry } from "../src/extensions/registry.js";
import { registerDynamicPluginsFromInstalls } from "../src/extensions/dynamic-plugins.js";
import type { ECPSystemConfig } from "../src/engine/types.js";

const pluginRoot = join(
  fileURLToPath(import.meta.url),
  "../../../..",
  "examples/third-party-provider-plugin",
);

describe("third-party provider plugin example", () => {
  it("loads and registers the mock provider via dynamic loader", async () => {
    const registry = new ExtensionRegistry();

    const systemConfig: ECPSystemConfig = {
      plugins: {
        installs: {
          "example-provider": {
            source: { type: "local", path: pluginRoot },
            path: pluginRoot,
            pluginKind: "third-party",
            version: "1.0.0",
          },
        },
      },
      security: {
        models: {},
        tools: {},
        executors: {},
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {
          allowKinds: ["provider", "third-party"],
          allowSourceTypes: ["builtin", "local"],
          allowIds: ["example-provider"],
        },
      },
    };

    await registerDynamicPluginsFromInstalls(registry, systemConfig);

    const registration = registry.getModelProviderRegistration("example-provider");
    expect(registration).toBeDefined();
    expect(registration!.id).toBe("example-provider");
    expect(registration!.kind).toBe("provider");
    expect(registration!.source).toBe("local");
    expect(registration!.version).toBe("1.0.0");
  });

  it("creates a working provider from the registration", async () => {
    const registry = new ExtensionRegistry();

    const systemConfig: ECPSystemConfig = {
      plugins: {
        installs: {
          "example-provider": {
            source: { type: "local", path: pluginRoot },
            path: pluginRoot,
            pluginKind: "third-party",
            version: "1.0.0",
          },
        },
      },
      security: {
        models: {},
        tools: {},
        executors: {},
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {
          allowKinds: ["provider", "third-party"],
          allowSourceTypes: ["builtin", "local"],
          allowIds: ["example-provider"],
        },
      },
    };

    await registerDynamicPluginsFromInstalls(registry, systemConfig);

    const provider = registry.createModelProvider("example-provider");
    expect(provider.name).toBe("example-provider");
    expect(provider.supportsToolCalling()).toBe(true);

    const result = await provider.generate({
      messages: [{ role: "user", content: "Hello ECP" }],
    });

    expect(result.content).toBe("[mock/mock-model-v1] Hello ECP");
    expect(result.finishReason).toBe("stop");
    expect(result.toolCalls).toEqual([]);
    expect(result.usage.promptTokens).toBeGreaterThan(0);
  });

  it("exercises tool calling on the mock provider", async () => {
    const registry = new ExtensionRegistry();

    const systemConfig: ECPSystemConfig = {
      plugins: {
        installs: {
          "example-provider": {
            source: { type: "local", path: pluginRoot },
            path: pluginRoot,
            pluginKind: "third-party",
            version: "1.0.0",
          },
        },
      },
      security: {
        models: {},
        tools: {},
        executors: {},
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {
          allowKinds: ["provider", "third-party"],
          allowSourceTypes: ["builtin", "local"],
          allowIds: ["example-provider"],
        },
      },
    };

    await registerDynamicPluginsFromInstalls(registry, systemConfig);

    const provider = registry.createModelProvider("example-provider");

    const result = await provider.generate({
      messages: [{ role: "user", content: "Search for ECP" }],
      tools: [
        {
          name: "search",
          description: "Search the web",
          parameters: { type: "object", properties: { input: { type: "string" } } },
        },
      ],
    });

    expect(result.finishReason).toBe("tool-calls");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("search");
    expect(result.toolCalls[0]!.arguments).toEqual({ input: "Search for ECP" });
  });
});
