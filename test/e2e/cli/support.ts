import { spawn } from "node:child_process"
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { setTimeout as delay } from "node:timers/promises"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
export const ecpBin = path.join(repoRoot, "packages/cli/bin/ecp.js")
export const pluginTestRoot = path.join(repoRoot, "plugins/plugin-test")
export const fixturesRoot = path.join(repoRoot, "fixtures")

/**
 * Create an isolated ECP_HOME with plugin-test linked for host discovery.
 * @category Test
 */
export async function createCliHome(options?: { linkPluginTest?: boolean }): Promise<{
  home: string
  dataDir: string
  env: NodeJS.ProcessEnv
}> {
  const home = await mkdtemp(path.join(os.tmpdir(), "ecp-cli-e2e-"))
  const dataDir = path.join(home, "plugins")
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(path.join(home, "logs"), { recursive: true })
  if (options?.linkPluginTest !== false) {
    seedPluginLink(dataDir, pluginTestRoot)
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ECP_HOME: home,
    ECP_DATA_DIR: dataDir,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  }
  return { home, dataDir, env }
}

/**
 * Write an oclif-shaped plugins package.json that links a plugin root.
 * @category Test
 */
export function seedPluginLink(dataDir: string, pluginRoot: string, name = "@executioncontrolprotocol/plugin-test"): void {
  mkdirSync(path.join(dataDir, "node_modules"), { recursive: true })
  writeFileSync(
    path.join(dataDir, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        oclif: {
          plugins: [{ type: "link", name, root: pluginRoot }],
        },
      },
      null,
      2,
    )}\n`,
  )
}

/**
 * Spawn `ecp` and capture stdout/stderr/exit.
 * @category Test
 */
export async function runEcp(
  args: string[],
  options: {
    env: NodeJS.ProcessEnv
    cwd?: string
    stdin?: string
    timeoutMs?: number
  },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ecpBin, ...args], {
      cwd: options.cwd ?? repoRoot,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`ecp ${args.join(" ")} timed out`))
    }, options.timeoutMs ?? 60_000)
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      })
    })
    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin)
      child.stdin.end()
    } else {
      child.stdin.end()
    }
  })
}

/**
 * Parse the first JSON value on stdout.
 * @category Test
 */
export function parseJsonStdout<T>(stdout: string): T {
  const line = stdout
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.startsWith("{") || part.startsWith("["))
  if (!line) throw new Error(`No JSON on stdout: ${stdout}`)
  return JSON.parse(line) as T
}

/**
 * Wait until host.json exists and health is ok.
 * @category Test
 */
export async function waitForHost(home: string, timeoutMs = 60_000): Promise<void> {
  const { readHostJson, checkHealth } = await import("../../../packages/host/src/index.js")
  const deadline = Date.now() + timeoutMs
  let last = "no-host.json"
  while (Date.now() < deadline) {
    const file = readHostJson(home)
    if (file) {
      const health = await checkHealth(`http://127.0.0.1:${file.port}`)
      last = health ? `status=${health.status} port=${file.port}` : `unreachable port=${file.port}`
      if (health?.status === "ok") return
    }
    await delay(200)
  }
  throw new Error(`host not healthy under ${home} (${last})`)
}

/**
 * Confirm the CLI binary is built.
 * @category Test
 */
export function assertCliBuilt(): void {
  if (!existsSync(ecpBin)) throw new Error(`missing ${ecpBin}`)
  if (!existsSync(path.join(repoRoot, "packages/cli/dist/commands/retrieve.js"))) {
    throw new Error("CLI dist commands missing; run pnpm run build")
  }
}

/**
 * `file://` URL for a local path, using the long Windows path when available.
 * Avoids `RUNNER~1` short paths that break `npm install` of tarballs.
 * @category Test
 */
export function fileUrlForLocalPath(filePath: string): string {
  const resolved = path.resolve(filePath)
  try {
    return pathToFileURL(realpathSync.native(resolved)).href
  } catch {
    return pathToFileURL(resolved).href
  }
}
