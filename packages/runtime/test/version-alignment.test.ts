import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { LATEST_PROTOCOL_VERSION } from "@executioncontrolprotocol/spec";
import { SYSTEM_CONFIG_SCHEMA_VERSION } from "../src/engine/system-config-loader.js";

/** Repo root: packages/runtime/test -> ../../../ */
const repoRoot = resolve(import.meta.dirname, "../../..");

function readPkg(path: string): { version?: string } {
  return JSON.parse(readFileSync(path, "utf8")) as { version?: string };
}

/** First two numeric components of a semver string (e.g. `0.5.1` -> `0.5`, `0.5.1-rc.1` -> `0.5`). */
function majorMinorFromPackageVersion(version: string): string {
  const m = version.match(/^(\d+)\.(\d+)/);
  if (!m) {
    throw new Error(`Invalid package version: ${JSON.stringify(version)}`);
  }
  return `${m[1]}.${m[2]}`;
}

/** Leading major.minor from protocol label (e.g. `0.5-draft` -> `0.5`). */
function majorMinorFromProtocolVersion(protocolVersion: string): string {
  const m = protocolVersion.match(/^(\d+)\.(\d+)/);
  if (!m) {
    throw new Error(`Invalid LATEST_PROTOCOL_VERSION: ${JSON.stringify(protocolVersion)}`);
  }
  return `${m[1]}.${m[2]}`;
}

describe("version alignment (packages vs system config vs Context protocol)", () => {
  it("SYSTEM_CONFIG_SCHEMA_VERSION matches major.minor of @executioncontrolprotocol/spec", () => {
    const specVersion = readPkg(resolve(repoRoot, "packages/spec/package.json")).version;
    expect(specVersion).toBeDefined();
    const mm = majorMinorFromPackageVersion(specVersion!);
    expect(SYSTEM_CONFIG_SCHEMA_VERSION).toBe(mm);
  });

  it("LATEST_PROTOCOL_VERSION major.minor matches workspace package major.minor", () => {
    const specVersion = readPkg(resolve(repoRoot, "packages/spec/package.json")).version;
    expect(specVersion).toBeDefined();
    const mm = majorMinorFromPackageVersion(specVersion!);
    expect(majorMinorFromProtocolVersion(LATEST_PROTOCOL_VERSION)).toBe(mm);
  });

  it("root and published workspace packages share the same version", () => {
    const rootVer = readPkg(resolve(repoRoot, "package.json")).version;
    expect(rootVer).toBeDefined();
    for (const name of ["spec", "runtime", "cli", "plugins"]) {
      const path = resolve(repoRoot, `packages/${name}/package.json`);
      const v = readPkg(path).version;
      expect(v, `packages/${name}/package.json`).toBe(rootVer);
    }
  });

  it("example system configs top-level version matches SYSTEM_CONFIG_SCHEMA_VERSION", () => {
    for (const rel of ["config/ecp.config.example.yaml", "examples/ecp.config.example.yaml"]) {
      const path = resolve(repoRoot, rel);
      if (!existsSync(path)) {
        continue;
      }
      const doc = yaml.load(readFileSync(path, "utf8")) as { version?: string };
      expect(doc.version, rel).toBe(SYSTEM_CONFIG_SCHEMA_VERSION);
    }
  });

  it("CLI default system config embed matches SYSTEM_CONFIG_SCHEMA_VERSION", () => {
    const path = resolve(repoRoot, "packages/cli/src/lib/default-ecp-config.ts");
    const src = readFileSync(path, "utf8");
    const m = src.match(/^\s*version:\s*"([^"]+)"/m);
    expect(m, "expected version: line in default-ecp-config.ts").toBeTruthy();
    expect(m![1]).toBe(SYSTEM_CONFIG_SCHEMA_VERSION);
  });

  it("repo spec.yaml specVersion matches ecp/v{LATEST_PROTOCOL_VERSION}", () => {
    const path = resolve(repoRoot, "spec.yaml");
    const doc = yaml.load(readFileSync(path, "utf8")) as { specVersion?: string };
    expect(doc.specVersion).toBe(`ecp/v${LATEST_PROTOCOL_VERSION}`);
  });
});
