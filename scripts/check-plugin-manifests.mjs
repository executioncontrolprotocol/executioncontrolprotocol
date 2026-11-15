#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const bin = path.join(root, "packages/plugin-sdk/dist/bin/ecp-plugin-manifest.js")
const pluginsDir = path.join(root, "plugins")

const entries = await readdir(pluginsDir, { withFileTypes: true })
const targets = []
for (const entry of entries) {
  if (!entry.isDirectory()) continue
  const packagePath = path.join(pluginsDir, entry.name, "package.json")
  try {
    const pkg = JSON.parse(await readFile(packagePath, "utf8"))
    if (pkg.ecp?.manifest) targets.push(path.join(pluginsDir, entry.name))
  } catch {
    // skip packages without package.json
  }
}

if (targets.length === 0) {
  console.log("No plugins with ecp.manifest found.")
  process.exit(0)
}

let failed = false
for (const cwd of targets) {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, "--check"], { cwd, stdio: "inherit" })
    child.on("exit", (exitCode) => resolve(exitCode ?? 1))
  })
  if (code !== 0) failed = true
}

process.exit(failed ? 1 : 0)
