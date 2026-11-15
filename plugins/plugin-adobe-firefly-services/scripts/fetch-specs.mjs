/**
 * Download the Firefly Services OpenAPI specs into openapi/. Run by hand when Adobe updates
 * a spec, then regenerate with `pnpm run generate` and commit both.
 * Usage (from the plugin folder): node scripts/fetch-specs.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { SPEC_SOURCES } from "./lib/spec-sources.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const openapiDir = join(root, "openapi")

async function main() {
  for (const [rel, url] of Object.entries(SPEC_SOURCES)) {
    const dest = join(openapiDir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    process.stdout.write(`Fetching ${rel}... `)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`)
    const body = await res.text()
    writeFileSync(dest, body, "utf8")
    console.log(`${body.length} bytes`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
