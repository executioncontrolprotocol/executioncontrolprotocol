import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { findBannedMetadataProsePhrase } from "@executioncontrolprotocol/types"

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "test") continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkTsFiles(full, out)
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(full)
  }
  return out
}

function extractWithMetadataBlocks(source: string): string[] {
  const blocks: string[] = []
  const re = /\.withMetadata\(\s*\{/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    let depth = 0
    let i = match.index + match[0].length - 1
    for (; i < source.length; i++) {
      const ch = source[i]
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) {
          blocks.push(source.slice(match.index, i + 1))
          break
        }
      }
    }
  }
  return blocks
}

/** Package name segment inside @executioncontrolprotocol/<pkg> */
function packageFromPath(filePath: string): string | undefined {
  const norm = filePath.replace(/\\/g, "/")
  const m =
    norm.match(/packages\/extensions\/([^/]+)\//) ??
    norm.match(/packages\/core\/src\/formats\//) ??
    norm.match(/packages\/core\/src\/testing\//)
  if (norm.includes("/formats/")) return "format"
  if (norm.includes("/testing/")) return "test"
  return m?.[1]
}

describe("first-party capability metadata prose", () => {
  const roots = [
    join(repoRoot, "packages/extensions"),
    join(repoRoot, "packages/core/src/formats"),
    join(repoRoot, "packages/core/src/testing"),
  ]
  const files = roots.flatMap((r) => walkTsFiles(r))

  it("does not embed schema how-to phrases", () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, "utf8")
      for (const block of extractWithMetadataBlocks(src)) {
        const banned = findBannedMetadataProsePhrase(block)
        if (banned) offenders.push(`${file}: ${banned}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("does not cross-advertise other @executioncontrolprotocol packages in metadata", () => {
    const offenders: string[] = []
    const idRe = /@executioncontrolprotocol\/([a-z0-9-]+)/g
    for (const file of files) {
      const own = packageFromPath(file)
      if (!own) continue
      const src = readFileSync(file, "utf8")
      for (const block of extractWithMetadataBlocks(src)) {
        idRe.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = idRe.exec(block))) {
          const pkg = m[1]
          if (!pkg) continue
          // Same package or shared protocol interface names are fine.
          if (pkg === own) continue
          if (own === "format" && pkg.startsWith("format-")) continue
          if (pkg === "model") continue
          offenders.push(`${file}: mentions @executioncontrolprotocol/${pkg}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
