import { execFile, execSync } from "node:child_process"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
/** Absolute path to the CLI bin. @category CLI */
export const cliBin = join(cliRoot, "bin", "run.js")
/** Monorepo root. @category CLI */
export const repoRoot = join(cliRoot, "..", "..")

/** Spawn result. @category CLI */
export interface CliResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * Hermetic oclif data/config dirs for a CLI spawn.
 * @category CLI
 */
export async function hermeticCliEnv(
  extra: NodeJS.ProcessEnv = {}
): Promise<{ env: NodeJS.ProcessEnv; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "ecp-cli-home-"))
  return {
    dir,
    env: {
      ...process.env,
      ECP_DATA_DIR: dir,
      ECP_CONFIG_DIR: dir,
      ...extra,
    },
  }
}

/**
 * Spawn `ecp` with optional hermetic dirs.
 * @category CLI
 */
export function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliBin, ...args],
      {
        cwd: options.cwd ?? repoRoot,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        env: options.env ?? process.env,
      },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? (err as { code: number }).code
            : err
              ? 1
              : 0
        resolve({ code, stdout, stderr })
      }
    )
  })
}

/**
 * Run `ecp <args> --help` and return stdout.
 * @category CLI
 */
export function runHelp(args: string, env?: NodeJS.ProcessEnv): string {
  return execSync(`node "${cliBin}" ${args} --help`, {
    cwd: repoRoot,
    encoding: "utf8",
    env: env ?? process.env,
  })
}
