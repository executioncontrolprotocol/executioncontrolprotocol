import { describe, it, expect } from "vitest";

import {
  buildModelProviderPatchFromFlags,
  buildPluginSecurityPolicyFromFlags,
  buildToolServerEntryFromFlags,
  parseUniqueOptionFlags,
} from "../src/lib/config-wiring-cli.js";

describe("parseUniqueOptionFlags", () => {
  it("parses key=value pairs", () => {
    expect(parseUniqueOptionFlags(["a=1", "b=hello"])).toEqual({ a: 1, b: "hello" });
  });

  it("rejects duplicate keys", () => {
    expect(() => parseUniqueOptionFlags(["x=1", "x=2"])).toThrow(/Duplicate/);
  });
});

describe("buildModelProviderPatchFromFlags", () => {
  it("builds defaultModel, supportedModels, and config", () => {
    expect(
      buildModelProviderPatchFromFlags({
        defaultModel: "gpt-4o-mini",
        supportedModelsRaw: ["gpt-4o-mini", "gpt-4o"],
        optionFlags: ["baseURL=http://localhost:11434"],
      }),
    ).toEqual({
      defaultModel: "gpt-4o-mini",
      supportedModels: ["gpt-4o-mini", "gpt-4o"],
      config: { baseURL: "http://localhost:11434" },
    });
  });

  it("adds defaultModel to supportedModels when only default is set", () => {
    expect(
      buildModelProviderPatchFromFlags({
        defaultModel: "gpt-4.1",
      }),
    ).toEqual({
      defaultModel: "gpt-4.1",
      supportedModels: ["gpt-4.1"],
    });
  });
});

describe("buildPluginSecurityPolicyFromFlags", () => {
  it("builds allow lists and strict", () => {
    const p = buildPluginSecurityPolicyFromFlags({
      allowKind: ["provider", "tool"],
      allowSourceType: ["builtin"],
      allowId: ["openai"],
      denyId: ["bad"],
      strict: true,
    });
    expect(p.allowKinds).toEqual(["provider", "tool"]);
    expect(p.allowSourceTypes).toEqual(["builtin"]);
    expect(p.allowIds).toEqual(["openai"]);
    expect(p.denyIds).toEqual(["bad"]);
    expect(p.strict).toBe(true);
  });

  it("rejects invalid allow-kind", () => {
    expect(() =>
      buildPluginSecurityPolicyFromFlags({
        allowKind: ["not-a-kind"],
      }),
    ).toThrow(/Invalid --allow-kind/);
  });

  it("sets allowThirdParty from flags", () => {
    expect(
      buildPluginSecurityPolicyFromFlags({
        allowThirdParty: true,
      }).allowThirdParty,
    ).toBe(true);
    expect(
      buildPluginSecurityPolicyFromFlags({
        allowThirdParty: false,
      }).allowThirdParty,
    ).toBe(false);
  });
});

describe("buildToolServerEntryFromFlags", () => {
  it("builds stdio transport", () => {
    const e = buildToolServerEntryFromFlags({
      transportType: "stdio",
      stdioCommand: "npx",
      stdioArg: ["-y", "@x/y"],
      optionFlags: ["foo=bar"],
    });
    expect(e.transport).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@x/y"],
    });
    expect(e.config).toEqual({ foo: "bar" });
  });

  it("builds sse transport", () => {
    const e = buildToolServerEntryFromFlags({
      transportType: "sse",
      sseUrl: "https://example.com/sse",
    });
    expect(e.transport).toEqual({ type: "sse", url: "https://example.com/sse" });
  });
});
