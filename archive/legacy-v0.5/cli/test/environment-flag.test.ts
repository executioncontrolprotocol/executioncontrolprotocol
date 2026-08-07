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

describe("--environment (EcpEnvironmentCommand)", () => {
  it(
    "lists --environment on run, validate, trace, trace list, graph help",
    { timeout: 60_000 },
    () => {
      for (const cmd of ["run", "validate", "trace", "trace list", "graph"]) {
        const out = help(cmd);
        expect(out, cmd).toContain("--environment");
      }
    },
  );

  it("config help does not advertise --environment", () => {
    const out = help("config");
    expect(out).not.toContain("--environment");
  });

  it("fails before run when --environment points to a missing file", () => {
    try {
      execSync(
        `node "${runJs}" run examples/single-executor/context.yaml --config config/ecp.config.example.yaml --environment ./ecp-missing-env-9f2a.env`,
        { encoding: "utf-8", cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
      );
      expect.fail("expected non-zero exit");
    } catch (e: unknown) {
      const err = e as { status?: number; stderr?: string };
      expect(err.status).not.toBe(0);
      const msg = `${err.stderr ?? ""}`;
      expect(msg).toMatch(/Environment file not found/i);
    }
  });
});
