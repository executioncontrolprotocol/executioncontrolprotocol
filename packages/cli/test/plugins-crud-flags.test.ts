import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const runJs = join(cliRoot, "bin", "run.js");

describe("ecp config plugins remove/update flags", () => {
  it("remove --clean deletes managed plugin directory from disk", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-plugins-clean-"));
    const installDir = join(dir, ".ecp", "plugins", "demo");
    mkdirSync(installDir, { recursive: true });
    writeFileSync(
      join(dir, "ecp.config.yaml"),
      [
        'version: "0.5"',
        "plugins:",
        "  installs:",
        "    demo:",
        '      source: { type: npm, spec: "@scope/demo-plugin" }',
        "      path: ./.ecp/plugins/demo",
        "      pluginKind: tool",
        "      config: {}",
        "",
      ].join("\n"),
      "utf8",
    );

    const out = execSync(`node "${runJs}" config plugins remove demo --clean`, {
      encoding: "utf-8",
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(out).toMatch(/Removed plugins\.installs\.demo/);
    expect(out).toMatch(/Deleted plugin files/);
    expect(existsSync(installDir)).toBe(false);
  });

  it("update --upgrade fails when existing source is not npm or git", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-plugins-upgrade-local-"));
    writeFileSync(
      join(dir, "ecp.config.yaml"),
      [
        'version: "0.5"',
        "plugins:",
        "  installs:",
        "    demo:",
        "      source: { type: local, path: ./plugins/demo }",
        "      path: ./plugins/demo",
        "      pluginKind: tool",
        "      config: {}",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(() =>
      execSync(`node "${runJs}" config plugins update demo --upgrade`, {
        encoding: "utf-8",
        cwd: dir,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow(/--upgrade only supports existing npm or git installs/);
  });
});
