/**
 * Manual CLI startup phase breakdown. Not run in CI.
 * Usage: ECP_HOME must point at a bench home with a warm host for operation timings.
 */
import { spawn } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createRequire } from "node:module"
import { performance } from "node:perf_hooks"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ecpBin = path.join(root, "packages/cli/bin/ecp.js")
const pluginTest = path.join(root, "plugins/plugin-test")
const cliRequire = createRequire(path.join(root, "packages/cli/package.json"))

function resolvePkg(name) {
  return pathToFileURL(cliRequire.resolve(name)).href
}

async function timeImport(label, specifier) {
  const t0 = performance.now()
  const href = specifier.startsWith("file:") ? specifier : resolvePkg(specifier)
  await import(href)
  const ms = performance.now() - t0
  return { phase: label, ms: Math.round(ms * 10) / 10 }
}

async function measureModulePhases() {
  const rows = []
  rows.push(await timeImport("oclif-core", "@oclif/core"))
  rows.push(await timeImport("oclif-plugin-help", "@oclif/plugin-help"))
  rows.push(await timeImport("oclif-plugin-plugins", "@oclif/plugin-plugins"))
  rows.push(await timeImport("oclif-plugin-not-found", "@oclif/plugin-not-found"))
  rows.push(await timeImport("host-barrel", pathToFileURL(path.join(root, "packages/host/dist/index.js")).href))
  try {
    rows.push(
      await timeImport("host-client-subpath", pathToFileURL(path.join(root, "packages/host/dist/client.js")).href),
    )
  } catch {
    rows.push({ phase: "host-client-subpath", ms: null, note: "not built yet" })
  }
  return rows
}

function runEcp(args, env) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    const child = spawn(process.execPath, [ecpBin, ...args], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8")
    })
    child.on("close", (code) => {
      const ms = performance.now() - t0
      if (code === 0 || code === 2) resolve({ ms, code, stderr })
      else reject(new Error(`ecp ${args.join(" ")} exited ${code}: ${stderr}`))
    })
  })
}

async function warmRetrieveMedian(env, runs = 11) {
  const samples = []
  for (let i = 0; i < runs; i++) {
    const { ms } = await runEcp(
      ["retrieve", "--type", "capability", "--id", "@executioncontrolprotocol/test.echo", "--json"],
      env,
    )
    samples.push(ms)
  }
  samples.sort((a, b) => a - b)
  const mid = Math.floor(samples.length / 2)
  const median =
    samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2
  return {
    phase: "B1-retrieve-id-warm-wall",
    runs,
    medianMs: Math.round(median * 10) / 10,
    samplesMs: samples.map((n) => Math.round(n * 10) / 10),
  }
}

async function main() {
  const home = mkdtempSync(path.join(tmpdir(), "ecp-phases-"))
  const dataDir = path.join(home, "plugins")
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(
    path.join(dataDir, "package.json"),
    `${JSON.stringify({
      private: true,
      oclif: { plugins: [{ type: "link", name: "@executioncontrolprotocol/test", root: pluginTest }] },
    })}\n`,
  )
  const env = { ...process.env, ECP_HOME: home, ECP_DATA_DIR: dataDir, NO_COLOR: "1", FORCE_COLOR: "0" }

  console.log("phases: module import timings (current process, sequential dynamic import)")
  const modules = await measureModulePhases()
  console.table(modules)

  console.log("phases: starting warm host")
  await runEcp(["host", "start", "--json"], env)
  const { checkHealth, readHostJson } = await import(
    pathToFileURL(path.join(root, "packages/host/dist/client.js")).href,
  )
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const file = readHostJson(home)
    if (file) {
      const health = await checkHealth(`http://127.0.0.1:${file.port}`)
      if (health?.status === "ok") break
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  const wall = await warmRetrieveMedian(env)
  console.log("phases: warm retrieve wall clock")
  console.table([wall])

  try {
    await runEcp(["host", "stop", "--force", "--json"], env)
  } catch {
    // ignore
  }

  return { modules, wall }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})