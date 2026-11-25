/**
 * Generate or verify packages/cli/oclif.manifest.json matches dist/commands.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cliRoot = path.join(root, "packages/cli")
const manifestPath = path.join(cliRoot, "oclif.manifest.json")
const write = process.argv.includes("--write")

if (!existsSync(path.join(cliRoot, "dist/commands"))) {
  console.error("check-oclif-manifest: run tsc for packages/cli first")
  process.exit(1)
}

const oclifBin = path.join(cliRoot, "node_modules/oclif/bin/run.js")

function runManifest() {
  execFileSync(process.execPath, [oclifBin, "manifest"], {
    cwd: cliRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  })
}

// `oclif manifest` emits commands in a nondeterministic order, so write and compare with every
// object's keys sorted (array order is kept).
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
  }
  return value
}

function formatManifest(raw) {
  return `${JSON.stringify(sortKeys(JSON.parse(raw)), null, 2)}\n`
}

// `oclif manifest` writes over the committed file, so read the committed copy first.
const committed = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : undefined

runManifest()

if (!existsSync(manifestPath)) {
  console.error("check-oclif-manifest: oclif manifest did not write oclif.manifest.json")
  process.exit(1)
}

const freshlyGenerated = formatManifest(readFileSync(manifestPath, "utf8"))

if (write) {
  writeFileSync(manifestPath, freshlyGenerated)
  console.log("check-oclif-manifest: wrote", path.relative(root, manifestPath))
  process.exit(0)
}

// Check mode never changes the working tree: put the committed file back before comparing.
if (committed === undefined) {
  console.error("check-oclif-manifest: missing committed manifest; run pnpm run build and commit it")
  process.exit(1)
}
writeFileSync(manifestPath, committed)
if (committed !== freshlyGenerated) {
  console.error("check-oclif-manifest: drift — regenerate with pnpm run build and commit packages/cli/oclif.manifest.json")
  process.exit(1)
}

console.log("check-oclif-manifest: ok")
