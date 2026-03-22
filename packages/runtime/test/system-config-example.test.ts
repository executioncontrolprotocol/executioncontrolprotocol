import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadSystemConfig } from "../src/engine/system-config-loader.js";
import { validateSystemConfigAgainstSpec } from "../src/engine/system-config-validate.js";

/** Repo root: packages/runtime/test -> ../../../ */
const repoRoot = resolve(import.meta.dirname, "../../..");

describe("canonical system config examples vs v0.5 spec", () => {
  it("config/ecp.config.example.yaml loads and matches enforced spec shape", () => {
    const path = resolve(repoRoot, "config/ecp.config.example.yaml");
    expect(existsSync(path), `missing ${path}`).toBe(true);

    const config = loadSystemConfig(path);
    const errors = validateSystemConfigAgainstSpec(config);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  it("examples/ecp.config.example.yaml loads and matches enforced spec shape when present", () => {
    const path = resolve(repoRoot, "examples/ecp.config.example.yaml");
    if (!existsSync(path)) {
      return;
    }

    const config = loadSystemConfig(path);
    const errors = validateSystemConfigAgainstSpec(config);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
