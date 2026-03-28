import { describe, expect, it } from "vitest";

import { assertPluginPermittedByPolicy } from "../src/engine/plugin-security.js";
import type { EcpPluginManifest, PluginInstallSource } from "@executioncontrolprotocol/spec";

describe("assertPluginPermittedByPolicy", () => {
  const manifest: EcpPluginManifest = {
    schemaVersion: "1",
    kind: "tool",
    id: "demo",
  };

  it("allows when policy is undefined", () => {
    expect(() => assertPluginPermittedByPolicy(manifest, { type: "npm", spec: "x" }, undefined)).not.toThrow();
  });

  it("throws when id is denied", () => {
    const source: PluginInstallSource = { type: "npm", spec: "demo@1" };
    expect(() =>
      assertPluginPermittedByPolicy(manifest, source, {
        denyIds: ["demo"],
      }),
    ).toThrow(/denyIds/);
  });

  it("throws when source type is not allowed", () => {
    const source: PluginInstallSource = { type: "npm", spec: "demo@1" };
    expect(() =>
      assertPluginPermittedByPolicy(manifest, source, {
        allowSourceTypes: ["builtin"],
      }),
    ).toThrow(/allowSourceTypes/);
  });

  it("throws when kind is not allowed", () => {
    const source: PluginInstallSource = { type: "npm", spec: "demo@1" };
    expect(() =>
      assertPluginPermittedByPolicy(manifest, source, {
        allowKinds: ["provider"],
      }),
    ).toThrow(/allowKinds/);
  });
});
