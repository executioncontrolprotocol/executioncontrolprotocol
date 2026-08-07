import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const runJs = join(cliRoot, "bin", "run.js");

describe("ecp config reset", () => {
  it("removes project ecp.config.yaml", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-cfg-rst-yaml-"));
    const cfg = join(dir, "ecp.config.yaml");
    writeFileSync(cfg, 'version: "0.5"\n');
    const out = execSync(`node "${runJs}" config reset`, {
      encoding: "utf-8",
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(out).toMatch(/Removed/);
    expect(existsSync(cfg)).toBe(false);
  });

  it("removes both local yaml and json when present", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-cfg-rst-both-"));
    const yamlPath = join(dir, "ecp.config.yaml");
    const jsonPath = join(dir, "ecp.config.json");
    writeFileSync(yamlPath, 'version: "0.5"\n');
    writeFileSync(jsonPath, "{}");
    execSync(`node "${runJs}" config reset`, {
      encoding: "utf-8",
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(existsSync(yamlPath)).toBe(false);
    expect(existsSync(jsonPath)).toBe(false);
  });

  it("removes global config files under HOME", { timeout: 30_000 }, () => {
    const sandbox = mkdtempSync(join(tmpdir(), "ecp-cfg-rst-home-"));
    const home = join(sandbox, "home");
    const ecpDir = join(home, ".ecp");
    mkdirSync(ecpDir, { recursive: true });
    const globalYaml = join(ecpDir, "config.yaml");
    const globalEcpYaml = join(ecpDir, "ecp.config.yaml");
    writeFileSync(globalYaml, 'version: "0.5"\n');
    writeFileSync(globalEcpYaml, 'version: "0.5"\n');
    execSync(`node "${runJs}" config reset --global`, {
      encoding: "utf-8",
      cwd: sandbox,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    expect(existsSync(globalYaml)).toBe(false);
    expect(existsSync(globalEcpYaml)).toBe(false);
  });

  it("removes only the path given by --config", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-cfg-rst-explicit-"));
    const a = join(dir, "a.yaml");
    const b = join(dir, "b.yaml");
    writeFileSync(a, 'version: "0.5"\n');
    writeFileSync(b, 'version: "0.5"\n');
    execSync(`node "${runJs}" config reset --config "${a}"`, {
      encoding: "utf-8",
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(true);
  });

  it("exits successfully when nothing to remove (local)", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-cfg-rst-none-"));
    const out = execSync(`node "${runJs}" config reset`, {
      encoding: "utf-8",
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(out).toMatch(/No system config file found/);
  });
});
