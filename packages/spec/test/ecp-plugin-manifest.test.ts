import { describe, expect, it } from "vitest";

import {
  assertEcpPluginManifest,
  coercePluginInstallSource,
  resolveManifestPluginKind,
} from "@executioncontrolprotocol/spec";

describe("ecp-plugin-manifest", () => {
  it("resolves third-party provides", () => {
    const m = {
      schemaVersion: "1",
      kind: "third-party" as const,
      id: "x",
      provides: "provider" as const,
    };
    assertEcpPluginManifest(m);
    expect(resolveManifestPluginKind(m)).toBe("provider");
  });

  it("resolveManifestPluginKind returns concrete kind", () => {
    const m = {
      schemaVersion: "1",
      kind: "tool" as const,
      id: "t",
    };
    assertEcpPluginManifest(m);
    expect(resolveManifestPluginKind(m)).toBe("tool");
  });

  it("coerces install source", () => {
    expect(coercePluginInstallSource({ type: "npm", spec: "a@1" })).toEqual({ type: "npm", spec: "a@1" });
    expect(coercePluginInstallSource({ type: "git", url: "https://example.com/r.git", ref: "main" })).toEqual({
      type: "git",
      url: "https://example.com/r.git",
      ref: "main",
    });
  });
});
