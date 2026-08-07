import { describe, expect, it } from "vitest";

import {
  getEffectiveSupportedModels,
  modelNotAllowedMessage,
  resolveEffectiveModelNameForProvider,
} from "../src/engine/model-policy.js";
import type { ECPSystemConfig } from "../src/engine/types.js";

describe("getEffectiveSupportedModels", () => {
  it("uses explicit supportedModels when non-empty", () => {
    expect(getEffectiveSupportedModels({ supportedModels: ["a", "b"], defaultModel: "a" })).toEqual(["a", "b"]);
  });

  it("uses [defaultModel] when supportedModels empty but default set", () => {
    expect(getEffectiveSupportedModels({ defaultModel: "gpt-4.1" })).toEqual(["gpt-4.1"]);
  });
});

describe("modelNotAllowedMessage", () => {
  const base: ECPSystemConfig = {
    version: "0.5",
    security: {
      models: {
        allowProviders: ["openai"],
        allowedModels: { openai: ["gpt-4o-mini"] },
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
        openai: { defaultModel: "gpt-4o-mini", supportedModels: ["gpt-4o-mini", "gpt-4o"] },
      },
    },
  };

  it("returns undefined when model is supported and allowed by security", () => {
    expect(modelNotAllowedMessage("openai", "gpt-4o-mini", base)).toBeUndefined();
  });

  it("returns message when model not supported on host", () => {
    const msg = modelNotAllowedMessage("openai", "gpt-5", base);
    expect(msg).toMatch(/not supported/);
    expect(msg).toMatch(/gpt-5/);
  });

  it("returns message when model supported but not in security.models.allowedModels", () => {
    const msg = modelNotAllowedMessage("openai", "gpt-4o", base);
    expect(msg).toMatch(/not allowed by security policy/);
    expect(msg).toMatch(/gpt-4o/);
  });

  it("returns message when allowProviders lists provider but security allowedModels entry is missing", () => {
    const cfg: ECPSystemConfig = {
      ...base,
      security: {
        ...base.security!,
        models: {
          allowProviders: ["openai"],
          allowedModels: {},
        },
      },
    };
    const msg = modelNotAllowedMessage("openai", "gpt-4o-mini", cfg);
    expect(msg).toMatch(/incomplete/);
  });
});

describe("resolveEffectiveModelNameForProvider", () => {
  it("uses selected model when set", () => {
    expect(resolveEffectiveModelNameForProvider("openai", "x", {})).toBe("x");
  });

  it("uses config default when present", () => {
    const cfg: ECPSystemConfig = {
      models: { providers: { openai: { defaultModel: "gpt-4o-mini" } } },
    };
    expect(resolveEffectiveModelNameForProvider("openai", undefined, cfg)).toBe("gpt-4o-mini");
  });

  it("uses built-in default when no config", () => {
    expect(resolveEffectiveModelNameForProvider("openai", undefined, {})).toBe("gpt-4o");
    expect(resolveEffectiveModelNameForProvider("ollama", undefined, {})).toBe("gemma3:1b");
  });
});
