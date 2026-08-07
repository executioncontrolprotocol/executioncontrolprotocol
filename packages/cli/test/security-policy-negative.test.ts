import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const runJs = join(cliRoot, "bin", "run.js");
const repoRoot = join(cliRoot, "..", "..");
const singleExecutorCtx = join(repoRoot, "examples", "single-executor", "context.yaml");

const SECURITY_STUB = `security:
  models: {}
  tools: {}
  executors: {}
  memory: {}
  agents: {}
  loggers: {}
  secrets: {}
  plugins: {}
`;

describe("negative host policy (CLI)", () => {
  it("validate fails when provider is not in security.models.allowProviders", { timeout: 60_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-pol-"));
    const cfgPath = join(dir, "host.yaml");
    writeFileSync(
      cfgPath,
      `version: "0.5"
${SECURITY_STUB}
security:
  models:
    allowProviders: ["openai"]
    allowedModels:
      openai: [gpt-4o-mini]
  tools: {}
  executors: {}
  memory: {}
  agents: {}
  loggers: {}
  secrets: {}
  plugins: {}
models:
  providers:
    openai:
      defaultModel: gpt-4o-mini
      supportedModels: [gpt-4o-mini]
    ollama:
      defaultModel: gemma3:1b
      supportedModels: [gemma3:1b]
`,
      "utf-8",
    );
    try {
      execSync(`node "${runJs}" validate "${singleExecutorCtx}" --config "${cfgPath}"`, {
        encoding: "utf-8",
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect.fail("expected non-zero exit");
    } catch (e: unknown) {
      const err = e as { status?: number; stderr?: string };
      expect(err.status).not.toBe(0);
      const msg = `${err.stderr ?? ""}`;
      expect(msg).toMatch(/allowProviders|not in system config/i);
    }
  });

  it("merged global policy denies provider when global allowProviders excludes it", { timeout: 60_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ecp-merge-"));
    writeFileSync(
      join(dir, "ecp.config.yaml"),
      `version: "0.5"
${SECURITY_STUB}
security:
  models:
    allowProviders: ["openai", "ollama"]
    allowedModels:
      openai: [gpt-4o-mini]
      ollama: [gemma3:1b]
  tools: {}
  executors: {}
  memory: {}
  agents: {}
  loggers: {}
  secrets: {}
  plugins: {}
models:
  providers:
    openai:
      defaultModel: gpt-4o-mini
      supportedModels: [gpt-4o-mini]
    ollama:
      defaultModel: gemma3:1b
      supportedModels: [gemma3:1b]
`,
      "utf-8",
    );
    const fakeGlobal = join(dir, ".ecp");
    mkdirSync(fakeGlobal, { recursive: true });
    writeFileSync(
      join(fakeGlobal, "config.yaml"),
      `version: "0.5"
${SECURITY_STUB}
security:
  models:
    allowProviders: ["openai"]
    allowedModels:
      openai: [gpt-4o-mini]
  tools: {}
  executors: {}
  memory: {}
  agents: {}
  loggers: {}
  secrets: {}
  plugins: {}
`,
      "utf-8",
    );
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
      expect(msg).toMatch(/allowProviders|not in system config/i);
    }
  });
});
