import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const runJs = join(cliRoot, "bin", "run.js");
const repoRoot = join(cliRoot, "..", "..");
const marketingCtx = join(repoRoot, "examples", "marketing-campaign-ollama", "context.yaml");

const SECURITY_STUB = `security:
  models:
    allowProviders: [openai]
    allowedModels:
      openai: [gpt-4o-mini]
  tools: {}
  executors: {}
  memory: {}
  agents: {}
  loggers: {}
  secrets: {}
  plugins: {}
`;

describe("models.providers wiring required (CLI)", () => {
  it("validate fails when Context needs ollama but models.providers has no ollama block", { timeout: 60_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-nowire-"));
    const cfgPath = join(dir, "host.yaml");
    writeFileSync(
      cfgPath,
      `version: "0.5"
${SECURITY_STUB}
models:
  providers:
    openai:
      defaultModel: gpt-4o-mini
      supportedModels: [gpt-4o-mini]
`,
      "utf-8",
    );
    try {
      execSync(`node "${runJs}" validate "${marketingCtx}" --config "${cfgPath}"`, {
        encoding: "utf-8",
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect.fail("expected non-zero exit");
    } catch (e: unknown) {
      const err = e as { status?: number; stderr?: string };
      expect(err.status).not.toBe(0);
      const msg = `${err.stderr ?? ""}`;
      expect(msg).toMatch(/not configured in system config/i);
      expect(msg).toMatch(/models\.providers/i);
    }
  });
});
