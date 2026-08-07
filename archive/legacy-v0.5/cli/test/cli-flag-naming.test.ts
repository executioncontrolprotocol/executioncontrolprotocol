import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const runJs = join(cliRoot, "bin", "run.js");
const repoRoot = join(cliRoot, "..", "..");

function help(cmd: string): string {
  return execSync(`node "${runJs}" ${cmd} --help`, {
    encoding: "utf-8",
    cwd: repoRoot,
  });
}

/**
 * User-facing CLI tokens use kebab-case (see `.cursor/rules/cli-crud.mdc`).
 * Oclif flag keys must use quoted kebab-case so `--default-model` is not exposed as `--defaultModel`.
 */
describe("CLI flag and arg naming (kebab-case)", () => {
  it("config path exposes --for-write, not camelCase --forWrite", { timeout: 60_000 }, () => {
    const out = help("config path");
    expect(out).toMatch(/--for-write\b/);
    expect(out).not.toMatch(/--forWrite\b/);
  });

  it("run and validate usage show CONTEXT-PATH for the context file argument", { timeout: 60_000 }, () => {
    expect(help("run")).toMatch(/\bCONTEXT-PATH\b/);
    expect(help("validate")).toMatch(/\bCONTEXT-PATH\b/);
  });

  it("trace and graph usage show RUN-ID for the trace id argument", { timeout: 60_000 }, () => {
    expect(help("trace")).toMatch(/\bRUN-ID\b/);
    expect(help("graph")).toMatch(/\bRUN-ID\b/);
  });
});
