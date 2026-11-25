#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const indexPath = path.join(root, "realignment/doc-index.md")
const before = readFileSync(indexPath, "utf8")

execFileSync(process.execPath, [path.join(root, "scripts/gen-doc-index.mjs")], {
  cwd: root,
  stdio: "pipe",
})

const after = readFileSync(indexPath, "utf8")
if (before !== after) {
  writeFileSync(indexPath, before)
  console.error(
    "realignment/doc-index.md is out of date; run: node scripts/gen-doc-index.mjs",
  )
  process.exit(1)
}