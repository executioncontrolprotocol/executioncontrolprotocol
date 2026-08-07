import { describe, expect, it } from "vitest";

import {
  MISSING_MERGED_SYSTEM_CONFIG_MESSAGE,
  mergeSystemConfigGlobalOverLocal,
  resolveLocalSystemConfigPath,
  resolveMergedSystemConfigRequired,
} from "../src/engine/system-config-merge.js";
import type { ECPSystemConfig } from "../src/engine/types.js";

describe("mergeSystemConfigGlobalOverLocal", () => {
  it("global overrides local scalars and nested keys", () => {
    const local: ECPSystemConfig = {
      version: "0.5",
      security: {
        models: { allowProviders: ["openai", "ollama"] },
        tools: {},
        executors: {},
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {},
      },
      models: { providers: { openai: { defaultModel: "gpt-4o-mini" } } },
    };
    const global: ECPSystemConfig = {
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
    };
    const merged = mergeSystemConfigGlobalOverLocal(local, global);
    expect(merged.security?.models?.allowProviders).toEqual(["ollama"]);
    expect(merged.models?.providers?.openai?.defaultModel).toBe("gpt-4o-mini");
  });

  it("replaces arrays from global", () => {
    const local: ECPSystemConfig = {
      security: {
        models: { allowProviders: ["a", "b"] },
        tools: {},
        executors: {},
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {},
      },
    };
    const global: ECPSystemConfig = {
      security: {
        models: { allowProviders: ["a"] },
        tools: {},
        executors: {},
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {},
      },
    };
    const merged = mergeSystemConfigGlobalOverLocal(local, global);
    expect(merged.security?.models?.allowProviders).toEqual(["a"]);
  });
});

describe("resolveLocalSystemConfigPath / resolveGlobalSystemConfigPath", () => {
  it("returns undefined when no file (cwd without config)", () => {
    expect(resolveLocalSystemConfigPath("/nonexistent-cwd-xyz-12345")).toBeUndefined();
  });
});

describe("resolveMergedSystemConfigRequired", () => {
  it("throws when no config exists in cwd", () => {
    expect(() => resolveMergedSystemConfigRequired(undefined, "/nonexistent-cwd-xyz-12345")).toThrow(
      MISSING_MERGED_SYSTEM_CONFIG_MESSAGE,
    );
  });
});
