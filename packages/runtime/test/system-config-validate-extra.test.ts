import { describe, expect, it } from "vitest";

import { validateSystemConfigAgainstSpec } from "../src/engine/system-config-validate.js";
import type { ECPSystemConfig } from "../src/engine/types.js";

describe("validateSystemConfigAgainstSpec default subsets", () => {
  it("errors when defaultModel not in supported model set", () => {
    const config: ECPSystemConfig = {
      version: "0.5",
      security: {
        models: {},
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
          openai: {
            defaultModel: "gpt-4.1",
            supportedModels: ["gpt-4o-mini"],
          },
        },
      },
    };
    const errors = validateSystemConfigAgainstSpec(config);
    expect(errors.some((e) => e.includes("defaultModel") && e.includes("supported"))).toBe(true);
  });

  it("errors when security.models.allowProviders lists a provider but allowedModels for that provider is empty", () => {
    const config: ECPSystemConfig = {
      version: "0.5",
      security: {
        models: {
          allowProviders: ["openai"],
          allowedModels: {},
        },
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
          openai: {
            defaultModel: "gpt-4o-mini",
            supportedModels: ["gpt-4o-mini"],
          },
        },
      },
    };
    const errors = validateSystemConfigAgainstSpec(config);
    expect(errors.some((e) => e.includes("allowedModels") && e.includes("openai"))).toBe(true);
  });

  it("errors when executors defaultEnable not in allowExecutors", () => {
    const config: ECPSystemConfig = {
      version: "0.5",
      security: {
        models: {},
        tools: {},
        executors: {
          allowExecutors: ["a"],
          defaultEnable: ["b"],
        },
        memory: {},
        agents: {},
        loggers: {},
        secrets: {},
        plugins: {},
      },
    };
    const errors = validateSystemConfigAgainstSpec(config);
    expect(errors.some((e) => e.includes("defaultEnable") && e.includes("allowExecutors"))).toBe(true);
  });
});
