import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const runJs = join(cliRoot, "bin", "run.js");

function writeBaseConfig(dir: string): string {
  const path = join(dir, "ecp.config.yaml");
  writeFileSync(path, 'version: "0.5"\n', "utf-8");
  return path;
}

function runCli(cmd: string, cwd: string): string {
  return execSync(`node "${runJs}" ${cmd}`, {
    encoding: "utf-8",
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("ecp config plugins CRUD", () => {
  it("add writes plugins.installs entry", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-plugins-add-"));
    const cfg = writeBaseConfig(dir);

    const out = runCli('config plugins add demo --npm "@scope/demo-plugin@1.0.0" --kind tool', dir);
    const content = readFileSync(cfg, "utf-8");

    expect(out).toMatch(/Wrote plugins\.installs\.demo/);
    expect(content).toMatch(/plugins:/);
    expect(content).toMatch(/installs:/);
    expect(content).toMatch(/demo:/);
    expect(content).toMatch(/spec:\s+'@scope\/demo-plugin@1\.0\.0'/);
  });

  it("get lists plugin install keys", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-plugins-get-"));
    writeFileSync(
      join(dir, "ecp.config.yaml"),
      ['version: "0.5"', "plugins:", "  installs:", "    demo:", "      source: { type: npm, spec: '@scope/demo-plugin@1.0.0' }", "      pluginKind: tool", "      config: {}", ""].join("\n"),
      "utf-8",
    );

    const out = runCli("config plugins get", dir);
    expect(out).toMatch(/plugins\.installs keys:/);
    expect(out).toMatch(/- demo/);
  });

  it("update replaces plugins.installs entry metadata", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-plugins-update-"));
    const cfg = writeBaseConfig(dir);
    runCli('config plugins add demo --npm "@scope/demo-plugin@1.0.0" --kind tool', dir);

    const out = runCli('config plugins update demo --npm "@scope/demo-plugin@2.0.0" --kind provider', dir);
    const content = readFileSync(cfg, "utf-8");

    expect(out).toMatch(/Wrote plugins\.installs\.demo/);
    expect(content).toMatch(/spec:\s+'@scope\/demo-plugin@2\.0\.0'/);
    expect(content).toMatch(/pluginKind: provider/);
    expect(content).not.toMatch(/spec:\s+'@scope\/demo-plugin@1\.0\.0'/);
  });

  it("remove deletes plugins.installs entry", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-plugins-remove-"));
    const cfg = writeBaseConfig(dir);
    runCli('config plugins add demo --npm "@scope/demo-plugin@1.0.0" --kind tool', dir);

    const out = runCli("config plugins remove demo", dir);
    const content = readFileSync(cfg, "utf-8");

    expect(out).toMatch(/Removed plugins\.installs\.demo/);
    expect(content).not.toMatch(/\bdemo:\b/);
  });
});
