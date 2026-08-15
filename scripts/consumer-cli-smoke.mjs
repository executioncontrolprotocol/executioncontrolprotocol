/**
 * Pack workspace packages into a fresh temp consumer project and smoke-test the CLI.
 *
 * Usage (from monorepo root, after `npm run build`):
 *   node scripts/consumer-cli-smoke.mjs
 *
 * Env:
 *   KEEP_CONSUMER_CLI=1 — leave the temp install directory
 */
import { execFileSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { listPublishableWorkspaces, topoSortPublishable } from "./list-publishable-workspaces.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const fixtureDir = join(root, "fixtures", "consumer-cli")
const keep = process.env.KEEP_CONSUMER_CLI === "1"

/** Workspace package names required for the echo consumer fixture + CLI binary. */
const REQUIRED = new Set([
  "@executioncontrolprotocol/types",
  "@executioncontrolprotocol/core",
  "@executioncontrolprotocol/policies",
  "@executioncontrolprotocol/secrets",
  "@executioncontrolprotocol/process-env",
  "@executioncontrolprotocol/format-toon",
  "@executioncontrolprotocol/extension-ollama",
  "@executioncontrolprotocol/node",
  "@executioncontrolprotocol/cli",
])

function assertBuilt() {
  const markers = [
    join(root, "packages/core/dist/index.js"),
    join(root, "packages/cli/dist/commands/run.js"),
    join(root, "packages/runtimes/node/dist/index.js"),
  ]
  for (const marker of markers) {
    if (!existsSync(marker)) {
      console.error(`Missing build output: ${marker}`)
      console.error("Run `npm run build` from the monorepo root first.")
      process.exit(1)
    }
  }
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
 * @param {string[]} args
 * @param {string} cwd
 */
function runNpx(args, cwd) {
  console.log(`$ npx ${args.join(" ")}`)
  execFileSync("npx", args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  })
}

assertBuilt()

if (!existsSync(join(fixtureDir, "workflow.ts"))) {
  console.error(`Fixture not found: ${fixtureDir}`)
  process.exit(1)
}

const all = listPublishableWorkspaces(root)
const selected = topoSortPublishable(all.filter((p) => REQUIRED.has(p.name)))
const missing = [...REQUIRED].filter((name) => !selected.some((p) => p.name === name))
if (missing.length > 0) {
  console.error(`Required packages not found in workspaces: ${missing.join(", ")}`)
  process.exit(1)
}

const workRoot = mkdtempSync(join(tmpdir(), "ecp-consumer-cli-"))
const packsDir = join(workRoot, "packs")
const consumerDir = join(workRoot, "consumer")
mkdirSync(packsDir, { recursive: true })
mkdirSync(consumerDir, { recursive: true })

console.log(`Consumer smoke work dir: ${workRoot}`)

try {
  /** @type {string[]} */
  const tarballs = []
  for (const pkg of selected) {
    console.log(`pack ${pkg.name}`)
    const out = execFileSync("npm", ["pack", "--pack-destination", packsDir], {
      cwd: pkg.dir,
      encoding: "utf8",
      env: process.env,
      shell: process.platform === "win32",
    }).trim()
    const filename = out.split(/\r?\n/).filter(Boolean).at(-1)
    if (!filename) {
      throw new Error(`npm pack produced no tarball for ${pkg.name}`)
    }
    tarballs.push(join(packsDir, filename))
  }

  for (const name of ["workflow.ts", "environment.ts"]) {
    copyFileSync(join(fixtureDir, name), join(consumerDir, name))
  }

  const fixturePkg = JSON.parse(readFileSync(join(fixtureDir, "package.json"), "utf8"))
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: fixturePkg.name,
        version: fixturePkg.version,
        private: true,
        type: "module",
        engines: fixturePkg.engines,
        dependencies: {
          zod: "^3.24.0",
        },
      },
      null,
      2,
    ),
  )

  runNpm(["install", "--no-package-lock", "zod@^3.24.0", ...tarballs], consumerDir)

  runNpx(["ecp", "compile", "workflow.ts", "-o", "workflow.json"], consumerDir)
  runNpx(["ecp", "validate", "workflow.json", "--env", "environment.ts"], consumerDir)
  runNpx(["ecp", "run", "workflow.ts", "--env", "environment.ts"], consumerDir)

  console.log("\nconsumer-cli smoke passed")
} catch (err) {
  console.error("\nconsumer-cli smoke failed")
  if (err instanceof Error) console.error(err.message)
  process.exitCode = 1
} finally {
  if (keep) {
    console.log(`KEEP_CONSUMER_CLI=1 — left at ${workRoot}`)
  } else {
    rmSync(workRoot, { recursive: true, force: true })
  }
}
