/**
 * Regenerate src/generated/ from the vendored OpenAPI specs in openapi/ (the families in
 * GENERATED_FAMILIES; see scripts/lib/generate.mjs).
 *
 * Usage (from the plugin folder):
 *   node scripts/generate-capabilities.mjs            write src/generated/
 *   node scripts/generate-capabilities.mjs --check    fail when src/generated/ is stale
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { GENERATED_FAMILIES, generateAll, loadFamilySpecs } from "./lib/generate.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const openapiDir = join(root, "openapi")
const generatedDir = join(root, "src", "generated")

function main() {
  const check = process.argv.includes("--check")
  const { files, errors, meta } = generateAll(loadFamilySpecs(openapiDir, { families: GENERATED_FAMILIES }))

  if (errors.length) {
    console.error(`Codegen found ${errors.length} schema error(s):`)
    for (const e of errors) console.error(` - ${e}`)
    process.exitCode = 1
    return
  }

  if (check) {
    const stale = Object.entries(files)
      .filter(([rel, content]) => readOrEmpty(join(generatedDir, rel)) !== content)
      .map(([rel]) => rel)
    const extra = listFiles(generatedDir).filter((rel) => !(rel in files))
    stale.push(...extra)
    if (stale.length) {
      console.error(`src/generated is out of date (${stale.join(", ")}). Run pnpm run generate.`)
      process.exitCode = 1
      return
    }
    console.log(`src/generated matches the OpenAPI specs (${meta.capabilityCount} capabilities).`)
    return
  }

  const wanted = new Set(Object.keys(files))
  for (const rel of listFiles(generatedDir)) {
    if (!wanted.has(rel)) rmSync(join(generatedDir, rel), { force: true })
  }
  let written = 0
  for (const [rel, content] of Object.entries(files)) {
    const target = join(generatedDir, rel)
    if (readOrEmpty(target) === content) continue
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, "utf8")
    written += 1
  }
  console.log(
    `Generated ${meta.capabilityCount} capabilities across ${meta.families.length} families` +
      ` (${written} files changed, ${meta.skipped.length} operations skipped; see src/generated/meta.json).`,
  )
}

/**
 * @param {string} path
 */
function readOrEmpty(path) {
  try {
    return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
  } catch {
    return ""
  }
}

/**
 * Files under dir, relative with forward slashes.
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {string[]}
 */
function listFiles(dir, prefix = "") {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}

main()
