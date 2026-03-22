import { describe, expect, it } from "vitest";
import {
  assertSystemConfigSchemaVersion,
  parseSystemConfigString,
  resolveAgentEndpointsMap,
  SYSTEM_CONFIG_SCHEMA_VERSION,
} from "../src/engine/system-config-loader.js";

describe("system-config-loader", () => {
  it("parses v0.5 YAML with security and models.providers", () => {
    const raw = `
version: "0.5"
security:
  models:
    allowProviders: [openai]
models:
  providers:
    openai:
      defaultModel: gpt-4o-mini
`;
    const cfg = parseSystemConfigString(raw, "yaml");
    expect(cfg.version).toBe(SYSTEM_CONFIG_SCHEMA_VERSION);
    expect(cfg.security?.models?.allowProviders).toEqual(["openai"]);
    expect(cfg.models?.providers?.openai?.defaultModel).toBe("gpt-4o-mini");
  });

  it("throws on unsupported version when set", () => {
    expect(() =>
      assertSystemConfigSchemaVersion({ version: "0.3" } as import("../src/engine/types.js").ECPSystemConfig),
    ).toThrow(/Unsupported system config version/);
  });

  it("resolveAgentEndpointsMap accepts url objects and legacy strings", () => {
    const cfg = parseSystemConfigString(
      `
version: "0.5"
agents:
  endpoints:
    a: { url: "https://a.example" }
    b: "https://b.example"
`,
      "yaml",
    );
    expect(resolveAgentEndpointsMap(cfg)).toEqual({
      a: "https://a.example",
      b: "https://b.example",
    });
  });
});
