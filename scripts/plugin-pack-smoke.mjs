/**
 * Pack core, node, plugin-sdk, cli and every plugin, install the CLI from
 * tarballs, then `ecp plugins install` each plugin tarball in a hermetic prefix.
 *
 * Usage (from monorepo root, after `pnpm run build`):
 *   node scripts/plugin-pack-smoke.mjs
 *
 * Env:
 *   KEEP_PLUGIN_PACK=1 — leave the temp install directory
 */
import { execFileSync, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { listPublishableWorkspaces } from "./list-publishable-workspaces.mjs"
import { parsePackTarballLine, resolvePackTarballPath } from "./resolve-pack-tarball.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const fixtureDir = join(root, "fixtures", "consumer-cli")
const jsonataPayload = join(root, "fixtures", "plugin-pack-smoke", "payload.json")
const toonFixture = join(root, "plugins", "plugin-format-toon", "test", "fixtures", "encode-input.json")
const sharpFixture = join(root, "plugins", "plugin-image-sharp", "test", "fixtures", "inspect-input.json")
const keep = process.env.KEEP_PLUGIN_PACK === "1"

/** Host packages packed so the CLI tarball does not hit the npm registry. */
export const HOST_PACK_NAMES = [
  "@executioncontrolprotocol/core",
  "@executioncontrolprotocol/node",
  "@executioncontrolprotocol/plugin-sdk",
  "@executioncontrolprotocol/cli",
]

/**
 * One smoke per first-party plugin. Policy plugins have no commands; they
 * show up in `ecp describe --policies --json`.
 * @type {Array<{ package: string, dir: string, topic: string, args: string[], expectJson?: boolean, match?: RegExp }>}
 */
export const PLUGIN_SMOKES = [
  {
    package: "@executioncontrolprotocol/plugin-test",
    dir: "plugins/plugin-test",
    topic: "test",
    args: ["test", "echo", "--help", "--json"],
    match: /echo/i,
  },
  {
    package: "@executioncontrolprotocol/plugin-jsonata",
    dir: "plugins/plugin-jsonata",
    topic: "jsonata",
    args: ["jsonata", "transform", "--expression", "$.a", "--input", jsonataPayload, "--json"],
    expectJson: true,
  },
  {
    package: "@executioncontrolprotocol/plugin-anthropic",
    dir: "plugins/plugin-anthropic",
    topic: "anthropic",
    args: ["anthropic", "generate", "--help", "--json"],
    match: /anthropic|generate/i,
  },
  {
    package: "@executioncontrolprotocol/plugin-openai",
    dir: "plugins/plugin-openai",
    topic: "openai",
    args: ["openai", "generate", "--help", "--json"],
    match: /openai|generate/i,
  },
  {
    package: "@executioncontrolprotocol/plugin-ollama",
    dir: "plugins/plugin-ollama",
    topic: "ollama",
    args: ["ollama", "generate", "--help", "--json"],
    match: /ollama|generate/i,
  },
  {
    package: "@executioncontrolprotocol/plugin-format-toon",
    dir: "plugins/plugin-format-toon",
    topic: "format-toon",
    args: ["format-toon", "encode", "--input", toonFixture, "--json"],
    expectJson: true,
  },
  {
    package: "@executioncontrolprotocol/plugin-format-mermaid",
    dir: "plugins/plugin-format-mermaid",
    topic: "format-mermaid",
    args: ["format-mermaid", "encode", "--input", toonFixture, "--json"],
    expectJson: true,
  },
  {
    package: "@executioncontrolprotocol/plugin-budget",
    dir: "plugins/plugin-budget",
    topic: "budget",
    args: ["describe", "--policies", "--json"],
    expectJson: true,
    match: /budget/i,
  },
  {
    package: "@executioncontrolprotocol/plugin-approval",
    dir: "plugins/plugin-approval",
    topic: "approval",
    args: ["describe", "--policies", "--json"],
    expectJson: true,
    match: /approval/i,
  },
  {
    package: "@executioncontrolprotocol/plugin-state-control",
    dir: "plugins/plugin-state-control",
    topic: "state-control",
    args: ["describe", "--policies", "--json"],
    expectJson: true,
    match: /state-control/i,
  },
  {
    package: "@executioncontrolprotocol/plugin-fal",
    dir: "plugins/plugin-fal",
    topic: "fal",
    args: ["fal", "generate", "--help", "--json"],
    match: /fal|generate/i,
  },
  {
    package: "@executioncontrolprotocol/plugin-image-sharp",
    dir: "plugins/plugin-image-sharp",
    topic: "image-sharp",
    args: ["image-sharp", "inspect", "--input", sharpFixture, "--json"],
    expectJson: true,
  },
  {
    package: "@executioncontrolprotocol/plugin-azure-blob-storage",
    dir: "plugins/plugin-azure-blob-storage",
    topic: "azure-blob-storage",
    args: ["azure-blob-storage", "upload", "--help", "--json"],
    match: /azure-blob-storage|upload/i,
  },
  {
    package: "@executioncontrolprotocol/plugin-adobe-firefly-services",
    dir: "plugins/plugin-adobe-firefly-services",
    topic: "adobe-firefly-services",
    args: ["adobe-firefly-services", "--help", "--json"],
    match: /firefly|adobe-firefly-services/i,
  },
]

function assertBuilt() {
  const markers = [
    join(root, "packages/core/dist/index.js"),
    join(root, "packages/cli/dist/commands.js"),
    join(root, "packages/environments/node/dist/index.js"),
    join(root, "packages/plugin-sdk/dist/index.js"),
  ]
  for (const marker of markers) {
    if (!existsSync(marker)) {
      console.error(`Missing build output: ${marker}`)
      console.error("Run `pnpm run build` from the monorepo root first.")
      process.exit(1)
    }
  }
}

/**
 * @param {string} stdout
 * @returns {{ ok?: boolean, data?: unknown, error?: { code?: string } }}
 */
export function parseJsonEnvelope(stdout) {
  const text = stdout.trim()
  const start = text.indexOf("{")
  if (start < 0) throw new Error(`No JSON object in output:\n${stdout}`)
  return JSON.parse(text.slice(start))
}

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function runNpm(args, cwd) {
  console.log(`$ npm ${args.join(" ")}`)
  execFileSync("npm", args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  })
}

/**
 * @param {string} dir
 * @param {string} packsDir
 */
function packOne(dir, packsDir) {
  const out = execFileSync("pnpm", ["pack", "--pack-destination", packsDir], {
    cwd: dir,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
  }).trim()
  const filename = parsePackTarballLine(out)
  if (!filename) throw new Error(`pnpm pack produced no tarball in ${dir}`)
  return resolvePackTarballPath(packsDir, filename)
}

function isMain() {
  const invoked = process.argv[1] ? resolve(process.argv[1]) : ""
  return invoked.endsWith("plugin-pack-smoke.mjs")
}

if (isMain()) {
  assertBuilt()
  if (!existsSync(join(fixtureDir, "workflow.ecp.ts"))) {
    console.error(`Fixture not found: ${fixtureDir}`)
    process.exit(1)
  }

  const byName = new Map(listPublishableWorkspaces(root).map((pkg) => [pkg.name, pkg]))
  const missingHosts = HOST_PACK_NAMES.filter((name) => !byName.has(name))
  if (missingHosts.length > 0) {
    console.error(`Required host packages not found: ${missingHosts.join(", ")}`)
    process.exit(1)
  }
  const missingPlugins = PLUGIN_SMOKES.filter((smoke) => !byName.has(smoke.package))
  if (missingPlugins.length > 0) {
    console.error(`Required plugins not found: ${missingPlugins.map((p) => p.package).join(", ")}`)
    process.exit(1)
  }

  const workRoot = mkdtempSync(join(tmpdir(), "ecp-plugin-pack-"))
  const packsDir = join(workRoot, "packs")
  const prefixDir = join(workRoot, "prefix")
  const dataDir = join(workRoot, "ecp-home")
  mkdirSync(packsDir, { recursive: true })
  mkdirSync(prefixDir, { recursive: true })
  mkdirSync(dataDir, { recursive: true })
  console.log(`Plugin pack smoke work dir: ${workRoot}`)

  try {
    /** @type {Map<string, string>} */
    const tarballs = new Map()
    for (const name of HOST_PACK_NAMES) {
      const pkg = byName.get(name)
      console.log(`pack ${name}`)
      tarballs.set(name, packOne(pkg.dir, packsDir))
    }
    for (const smoke of PLUGIN_SMOKES) {
      const pkg = byName.get(smoke.package)
      console.log(`pack ${smoke.package}`)
      tarballs.set(smoke.package, packOne(pkg.dir, packsDir))
    }

    writeFileSync(
      join(prefixDir, "package.json"),
      JSON.stringify({ name: "ecp-plugin-pack-prefix", private: true, type: "module" }, null, 2),
    )
    runNpm(
      [
        "install",
        "--no-package-lock",
        "zod@^3.24.0",
        ...HOST_PACK_NAMES.map((name) => tarballs.get(name)),
      ],
      prefixDir,
    )

    const hostFileDeps = Object.fromEntries(
      HOST_PACK_NAMES.map((name) => [name, tarballs.get(name)]),
    )
    writeFileSync(
      join(dataDir, "package.json"),
      JSON.stringify(
        {
          name: "ecp-plugin-home",
          private: true,
          dependencies: hostFileDeps,
          overrides: hostFileDeps,
          oclif: { schema: 1, plugins: [] },
        },
        null,
        2,
      ),
    )
    runNpm(["install", "--no-package-lock", "--omit", "dev"], dataDir)

    const ecpJs = join(prefixDir, "node_modules", "@executioncontrolprotocol", "cli", "bin", "run.js")
    if (!existsSync(ecpJs)) throw new Error(`CLI bin missing after install: ${ecpJs}`)
    const env = {
      ...process.env,
      ECP_DATA_DIR: dataDir,
      ECP_CONFIG_DIR: dataDir,
      ECP_ALLOW_SOURCE: "path",
      ECP_TRUST_THIRD_PARTY: "1",
    }

    /**
     * @param {string[]} args
     */
    function runEcp(args) {
      console.log(`$ ecp ${args.join(" ")}`)
      const result = spawnSync(process.execPath, [ecpJs, ...args], {
        cwd: prefixDir,
        encoding: "utf8",
        env,
        maxBuffer: 20 * 1024 * 1024,
      })
      return {
        code: result.status ?? 1,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      }
    }

    /** @type {Set<string>} */
    const installedPlugins = new Set()
    /**
     * @param {string} packageName
     */
    function installPlugin(packageName) {
      if (installedPlugins.has(packageName)) return
      const tarball = tarballs.get(packageName)
      const spec = pathToFileURL(tarball).href
      const installed = runEcp(["plugins", "install", spec])
      if (installed.code !== 0) {
        throw new Error(`${packageName} plugins install failed\n${installed.stdout}\n${installed.stderr}`)
      }
      installedPlugins.add(packageName)
    }

    installPlugin("@executioncontrolprotocol/plugin-test")

    const compiled = runEcp(["compile", join(fixtureDir, "workflow.ecp.ts"), "-o", "workflow.json"])
    if (compiled.code !== 0) {
      throw new Error(`ecp compile failed\n${compiled.stdout}\n${compiled.stderr}`)
    }
    const validated = runEcp(["validate", "workflow.json"])
    if (validated.code !== 0) {
      throw new Error(`ecp validate failed\n${validated.stdout}\n${validated.stderr}`)
    }
    const ran = runEcp(["run", join(fixtureDir, "workflow.ecp.ts")])
    if (ran.code !== 0) {
      throw new Error(`ecp run failed\n${ran.stdout}\n${ran.stderr}`)
    }

    for (const smoke of PLUGIN_SMOKES) {
      installPlugin(smoke.package)
      const help = runEcp([smoke.topic, "--help"])
      if (help.code !== 0 && !smoke.package.includes("plugin-budget") && !smoke.package.includes("plugin-approval") && !smoke.package.includes("plugin-state-control")) {
        throw new Error(`${smoke.topic} --help failed\n${help.stdout}\n${help.stderr}`)
      }
      const res = runEcp(smoke.args)
      if (res.code !== 0) {
        throw new Error(
          `${smoke.package} smoke failed (${res.code})\n${res.stdout}\n${res.stderr}`,
        )
      }
      const combined = `${res.stdout}\n${res.stderr}`
      if (smoke.match && !smoke.match.test(combined)) {
        throw new Error(`${smoke.package} output did not match ${smoke.match}\n${combined}`)
      }
      if (smoke.expectJson) {
        const body = parseJsonEnvelope(res.stdout)
        if (body.ok === false) {
          throw new Error(`${smoke.package} envelope ok=false\n${res.stdout}`)
        }
        if (body.ok !== true && body.data === undefined && body.error === undefined) {
          throw new Error(`${smoke.package} missing JSON envelope\n${res.stdout}`)
        }
      }
    }

    const fireflyAlias = runEcp(["firefly", "--help"])
    if (fireflyAlias.code !== 0) {
      throw new Error(`ecp firefly --help failed\n${fireflyAlias.stdout}\n${fireflyAlias.stderr}`)
    }

    const started = Date.now()
    const rootHelp = runEcp(["--help"])
    const helpMs = Date.now() - started
    if (rootHelp.code !== 0) {
      throw new Error(`ecp --help failed\n${rootHelp.stdout}\n${rootHelp.stderr}`)
    }
    console.log(`ecp --help with all first-party plugins installed: ${helpMs}ms`)

    console.log("\nplugin-pack-smoke passed")
  } catch (err) {
    console.error("\nplugin-pack-smoke failed")
    if (err instanceof Error) console.error(err.message)
    process.exitCode = 1
  } finally {
    if (keep) {
      console.log(`KEEP_PLUGIN_PACK=1 — left at ${workRoot}`)
    } else {
      rmSync(workRoot, { recursive: true, force: true })
    }
  }
}
