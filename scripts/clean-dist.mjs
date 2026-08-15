import { rmSync, readdirSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))

/** Top-level coverage / V8 dump directories produced by local or CI runs. */
const COVERAGE_DIRS = ["coverage", "coverage-tmp", "v8-cov", ".coverage", "@coverage"]

function removePath(p) {
  rmSync(p, { recursive: true, force: true })
}

/** Remove Vitest/V8 coverage output directories at the repo root. */
function cleanCoverage() {
  for (const name of COVERAGE_DIRS) {
    const p = join(root, name)
    if (existsSync(p)) removePath(p)
  }
}

/** Remove package `dist/` trees and `*.tsbuildinfo` under `packages/`. */
function cleanDist() {
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) {
        if (name === "node_modules") continue
        if (name === "dist") {
          removePath(p)
          continue
        }
        walk(p)
      } else if (name.endsWith(".tsbuildinfo")) {
        rmSync(p, { force: true })
      }
    }
  }
  walk(join(root, "packages"))
}

const mode = process.argv[2] ?? "all"

if (mode === "coverage") {
  cleanCoverage()
} else if (mode === "dist") {
  cleanDist()
} else {
  cleanDist()
  cleanCoverage()
}
