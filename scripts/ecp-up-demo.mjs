#!/usr/bin/env node
/**
 * Start `ecp up` for the local browser demo from the monorepo root.
 *
 * Default: host env at apps/browser-demo/host (Sharp, fal, OpenAI, Anthropic) + Ollama.
 * Pass `--ollama-only` to skip `--env` (Ollama + storage only).
 *
 * Extra args are forwarded to `ecp up` (e.g. `--no-open`, `--port 3091`).
 */
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const ecpBin = join(root, "packages", "cli", "bin", "run.js")
const hostEnv = join(root, "apps", "browser-demo", "host", "environment.ts")

const rawArgs = process.argv.slice(2)
const ollamaOnly = rawArgs.includes("--ollama-only")
const forwarded = rawArgs.filter((a) => a !== "--ollama-only")

const args = [
  ecpBin,
  "up",
  "--open-url",
  "http://localhost:5173/",
  "--cors-origin",
  "http://localhost:5173",
]

if (!ollamaOnly) {
  args.push("--env", hostEnv)
}

args.push(...forwarded)

const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
