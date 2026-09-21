/**
 * Pack core, types, and one vendor package, then typecheck an import against the
 * tarballs (not the workspace link). Proves vendor code compiles on the published surface.
 *
 * Usage (from monorepo root, after `pnpm run build`):
 *   node scripts/vendor-pack-smoke.mjs
 *
 * Env:
 *   KEEP_VENDOR_PACK=1 — leave the temp install directory
 */
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { listPublishableWorkspaces } from "./list-publishable-workspaces.mjs"
import { parsePackTarballLine, resolvePackTarballPath } from "./resolve-pack-tarball.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const keep = process.env.KEEP_VENDOR_PACK === "1"
const PACK_NAMES = [
  "@executioncontrolprotocol/types",
  "@executioncontrolprotocol/core",
  "@executioncontrolprotocol/jsonata",
]

function assertBuilt() {
  const markers = [
    join(root, "packages/types/dist/index.js"),
    join(root, "packages/core/dist/index.js"),
    join(root, "packages/vendor/jsonata/dist/index.js"),
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

assertBuilt()

const byName = new Map(listPublishableWorkspaces(root).map((pkg) => [pkg.name, pkg]))
const selected = PACK_NAMES.map((name) => byName.get(name))
const missing = PACK_NAMES.filter((_, index) => !selected[index])
if (missing.length > 0) {
  console.error(`Required packages not found in workspaces: ${missing.join(", ")}`)
  process.exit(1)
}

const workRoot = mkdtempSync(join(tmpdir(), "ecp-vendor-pack-"))
const packsDir = join(workRoot, "packs")
const consumerDir = join(workRoot, "consumer")
mkdirSync(packsDir, { recursive: true })
mkdirSync(consumerDir, { recursive: true })

console.log(`Vendor pack smoke work dir: ${workRoot}`)

try {
  /** @type {string[]} */
  const tarballs = []
  for (const pkg of selected) {
    if (!pkg) continue
    console.log(`pack ${pkg.name}`)
    const out = execFileSync("pnpm", ["pack", "--pack-destination", packsDir], {
      cwd: pkg.dir,
      encoding: "utf8",
      env: process.env,
      shell: process.platform === "win32",
    }).trim()
    const filename = parsePackTarballLine(out)
    if (!filename) {
      throw new Error(`pnpm pack produced no tarball for ${pkg.name}`)
    }
    tarballs.push(resolvePackTarballPath(packsDir, filename))
  }

  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "ecp-vendor-pack-smoke",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(consumerDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "Node16",
          moduleResolution: "Node16",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        files: ["probe.ts"],
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(consumerDir, "probe.ts"),
    [
      'import "@executioncontrolprotocol/jsonata"',
      'import { defineExtension } from "@executioncontrolprotocol/core"',
      'import type { FileRef } from "@executioncontrolprotocol/types"',
      "void defineExtension",
      "export type ProbeFile = FileRef",
      "",
    ].join("\n"),
  )

  runNpm(
    ["install", "--no-package-lock", "typescript@5", "zod@3", ...tarballs],
    consumerDir,
  )
  runNpm(["exec", "--", "tsc", "-p", "tsconfig.json", "--noEmit"], consumerDir)

  console.log("\nvendor pack smoke passed")
} catch (err) {
  console.error("\nvendor pack smoke failed")
  if (err instanceof Error) console.error(err.message)
  process.exitCode = 1
} finally {
  if (keep) {
    console.log(`KEEP_VENDOR_PACK=1 — left at ${workRoot}`)
  } else if (process.exitCode !== 1) {
    rmSync(workRoot, { recursive: true, force: true })
  } else {
    console.error(`Left failed work dir at ${workRoot}`)
  }
}
