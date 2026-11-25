import { mkdirSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createLocalHost, generateHostToken, type LocalHost } from "@executioncontrolprotocol/host"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const pluginTestRoot = path.join(repoRoot, "plugins/plugin-test")
const appWebRoot = path.join(repoRoot, "packages/app/dist/web")

/**
 * Temp workspace + running host for App Playwright tests.
 * @category App
 */
export interface AppE2eHarness {
  /** Absolute ECP_HOME. */
  home: string
  /** Working directory with fixture executions. */
  workDir: string
  /** Host instance. */
  host: LocalHost
  /** Base URL. */
  baseUrl: string
  /** Bearer token. */
  token: string
  /** Absolute path of the primary demo execution. */
  demoPath: string
  /** Absolute path of the script-backed execution. */
  scriptPath: string
  /** Absolute path of the companion script file. */
  bannerPath: string
  /** Parallel execution for frame overlay tests. */
  parallelPath: string
  /** Execution using test.bounded, whose accepts types `text` as a string (typed-port test). */
  typedPath: string
  /** Stop the host. */
  stop: () => Promise<void>
}

/**
 * Start a server host with `plugin-test` and write App fixtures under a temp dir.
 * @category App
 */
export async function startAppHarness(): Promise<AppE2eHarness> {
  const home = await mkdtemp(path.join(os.tmpdir(), "ecp-app-e2e-home-"))
  const workDir = await mkdtemp(path.join(os.tmpdir(), "ecp-app-e2e-work-"))
  const token = generateHostToken()

  const demoPath = path.join(workDir, "demo.ecp.json")
  writeFileSync(
    demoPath,
    `${JSON.stringify(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: {
          id: "demo",
          label: "Demo",
          accepts: {
            type: "object",
            properties: {
              message: { type: "string", default: "hello" },
            },
            required: ["message"],
          },
        },
        steps: [
          {
            id: "echo",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: { $ref: "state.message" } },
            as: "out",
          },
        ],
      },
      null,
      2,
    )}\n`,
  )

  const bannerPath = path.join(workDir, "banner.js")
  writeFileSync(bannerPath, "const greeting = 'v1'\n")
  const scriptPath = path.join(workDir, "scripted.ecp.json")
  writeFileSync(
    scriptPath,
    `${JSON.stringify(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { label: "Scripted" },
        steps: [
          {
            id: "scripted",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: { $script: { lang: "js", path: "banner.js" } } },
            as: "out",
          },
        ],
      },
      null,
      2,
    )}\n`,
  )

  const typedPath = path.join(workDir, "typed.ecp.json")
  writeFileSync(
    typedPath,
    `${JSON.stringify(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "bounded", uses: "@executioncontrolprotocol/test.bounded", input: { text: "hi" }, as: "out" }],
      },
      null,
      2,
    )}\n`,
  )

  const parallelPath = path.join(workDir, "parallel.ecp.json")
  writeFileSync(
    parallelPath,
    `${JSON.stringify(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            type: "parallel",
            id: "prepare",
            label: "Prepare both sides in parallel for the pipeline",
            maxConcurrency: 2,
            branches: [
              [
                {
                  id: "left",
                  uses: "@executioncontrolprotocol/test.echo",
                  input: { value: "left" },
                  as: "left",
                },
              ],
              [
                {
                  id: "right",
                  uses: "@executioncontrolprotocol/test.echo",
                  input: { value: "right" },
                  as: "right",
                },
              ],
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  )

  mkdirSync(path.join(workDir, "nested"), { recursive: true })
  writeFileSync(
    path.join(workDir, "nested", "other.ecp.json"),
    `${JSON.stringify(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "echo",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "nested" },
            as: "out",
          },
        ],
      },
      null,
      2,
    )}\n`,
  )

  const host = await createLocalHost({
    home,
    mode: "server",
    port: 0,
    token,
    extraPlugins: [pluginTestRoot],
    appRoot: appWebRoot,
  })

  return {
    home,
    workDir,
    host,
    baseUrl: host.url!,
    token,
    demoPath,
    scriptPath,
    bannerPath,
    parallelPath,
    typedPath,
    stop: () => host.stop(),
  }
}

/**
 * Open the App with a fragment.
 * @category App
 */
export function appUrl(
  baseUrl: string,
  token: string,
  params: { open?: string; id?: string; dir?: string },
): string {
  const search = new URLSearchParams()
  search.set("token", token)
  if (params.open) search.set("open", params.open)
  if (params.id) search.set("id", params.id)
  if (params.dir) search.set("dir", params.dir)
  return `${baseUrl}/app/#${search.toString()}`
}
