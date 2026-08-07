import { describe, expect, it } from "vitest"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const CORE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const CORE_SRC = path.join(CORE_ROOT, "src")
const CORE_DIST_INDEX = path.join(CORE_ROOT, "dist/index.js")

/** Paths (relative to `src/`) allowed to use Node built-ins or native esbuild. */
const NODE_HOST_REL = new Set([
  "loaders/files.ts",
  "loaders/index.ts",
  "compile/evaluate.ts",
  "compile/evaluate-harness-artifact.ts",
  "compile/transpile.ts",
  "compile/index.ts",
  "compile/entry.ts",
  "harness/repair-loop-timing.ts",
])

const NODE_IMPORT_PATTERNS = [
  /from\s+["']node:/,
  /import\s*\(\s*["']node:/,
  /from\s+["']fs["']/,
  /from\s+["']path["']/,
  /from\s+["']os["']/,
  /await\s+import\s*\(\s*["']esbuild["']\s*\)/,
]

const FORBIDDEN_ANYWHERE = ["keytar", "@modelcontextprotocol", "@temporalio", "@oclif"]

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) files.push(...(await listTsFiles(full)))
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) files.push(full)
  }
  return files
}

function isNodeHostFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/")
  if (NODE_HOST_REL.has(normalized)) return true
  return (
    normalized.startsWith("loaders/") ||
    normalized.startsWith("harness/prompts/")
  )
}

describe("@executioncontrolprotocol/core package boundary", () => {
  it("restricts Node and native esbuild imports to host subpaths only", async () => {
    const files = await listTsFiles(CORE_SRC)
    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(CORE_SRC, file).replace(/\\/g, "/")
      const text = await readFile(file, "utf8")
      for (const mod of FORBIDDEN_ANYWHERE) {
        if (text.includes(mod)) violations.push(`${rel}: ${mod}`)
      }
      if (isNodeHostFile(rel)) continue
      for (const pattern of NODE_IMPORT_PATTERNS) {
        if (pattern.test(text)) violations.push(`${rel}: ${pattern}`)
      }
    }
    expect(violations).toEqual([])
  })

  it("main barrel does not import loaders or Node compile modules", async () => {
    const indexText = await readFile(path.join(CORE_SRC, "index.ts"), "utf8")
    expect(indexText).not.toMatch(/from\s+["']\.\/loaders/)
    expect(indexText).not.toMatch(/from\s+["']\.\/compile/)
  })

  it("built main entry does not reference loaders or compile subpaths", async () => {
    const text = await readFile(CORE_DIST_INDEX, "utf8")
    expect(text).not.toMatch(/loaders\/index/)
    expect(text).not.toMatch(/compile\/entry/)
    expect(text).not.toMatch(/compile\/index/)
  })
})
