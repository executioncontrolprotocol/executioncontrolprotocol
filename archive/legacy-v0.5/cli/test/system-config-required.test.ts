import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const runJs = join(cliRoot, "bin", "run.js");
const repoRoot = join(cliRoot, "..", "..");
const singleExecutorCtx = join(repoRoot, "examples", "single-executor", "context.yaml");

describe("required system config (host security)", () => {
  it("validate fails when cwd has no ecp.config and no ~/.ecp", { timeout: 60_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-val-nocfg-"));
    try {
      execSync(`node "${runJs}" validate "${singleExecutorCtx}"`, {
        encoding: "utf-8",
        cwd: dir,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, HOME: dir },
      });
      expect.fail("expected non-zero exit");
    } catch (e: unknown) {
      const err = e as { status?: number; stderr?: string };
      expect(err.status).not.toBe(0);
      const msg = `${err.stderr ?? ""}`;
      expect(msg).toMatch(/No system configuration file found/i);
    }
  });
});
