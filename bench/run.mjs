/**
 * B1–B8 CLI / schema-scale benchmarks. Writes JSON under bench/results/ and enforces budgets.json.
 * B8 (1k default; also 5k when ECP_BENCH_SCALE=5000): see bench/b8.mjs.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir, platform } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { performance } from "node:perf_hooks"
import { runB8 } from "./b8.mjs"
import { killRegisteredHostPidsBeforeRm } from "./host-pid-fallback.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ecpBin = path.join(root, "packages/cli/bin/ecp.js")
const pluginTest = path.join(root, "plugins/plugin-test")
const pluginAnthropic = path.join(root, "plugins/plugin-anthropic")
const pluginAzure = path.join(root, "plugins/plugin-azure-blob-storage")
const pluginFirefly = path.join(root, "plugins/plugin-adobe-firefly-services")
const echoFixture = path.join(root, "fixtures/manifests/runs/echo.ecp.json")
const exprFixture = path.join(root, "fixtures/manifests/valid/branch.ecp.json")
const runs = Number(process.env.ECP_BENCH_RUNS ?? 11)
const date = new Date().toISOString().slice(0, 10)
const outDir = path.join(root, "bench", "results")
mkdirSync(outDir, { recursive: true })

if (!existsSync(ecpBin)) {
  console.error("bench: CLI bin missing; run pnpm run build first")
  process.exit(1)
}

const home = mkdtempSync(path.join(tmpdir(), "ecp-bench-"))
const dataDir = path.join(home, "plugins")
mkdirSync(dataDir, { recursive: true })
writeFileSync(
  path.join(dataDir, "package.json"),
  `${JSON.stringify({
    private: true,
    oclif: { plugins: [{ type: "link", name: "@executioncontrolprotocol/plugin-test", root: pluginTest }] },
  })}\n`,
)

const baseEnv = {
  ...process.env,
  ECP_HOME: home,
  ECP_DATA_DIR: dataDir,
  NO_COLOR: "1",
  FORCE_COLOR: "0",
}

const scenarios = []

try {
  scenarios.push(await timeScenario("B1-retrieve-id-in-process", async () => {
    await runEcp(["retrieve", "--type", "capability", "--id", "@executioncontrolprotocol/test.echo", "--json"], baseEnv)
  }))

  await runEcp(["host", "start", "--json"], baseEnv)
  await waitHealthy(home)

  scenarios.push(await timeScenario("B1-retrieve-id-warm", async () => {
    await runEcp(["retrieve", "--type", "capability", "--id", "@executioncontrolprotocol/test.echo", "--json"], baseEnv)
  }))

  scenarios.push(await timeScenario("B2-retrieve-query-warm", async () => {
    await runEcp(["retrieve", "--type", "capability", "--query", "echo", "--json"], baseEnv)
  }))

  await runEcp(["host", "stop", "--force", "--json"], baseEnv)

  scenarios.push(await timeScenario("B2-retrieve-query-in-process", async () => {
    await runEcp(["retrieve", "--type", "capability", "--query", "echo", "--json"], baseEnv)
  }))

  scenarios.push(await timeScenario("B3-execute-echo-in-process", async () => {
    await runEcp(["execute", echoFixture, "--json"], baseEnv)
  }))

  await runEcp(["host", "start", "--json"], baseEnv)
  await waitHealthy(home)

  scenarios.push(await timeScenario("B3-execute-echo-warm", async () => {
    await runEcp(["execute", echoFixture, "--json"], baseEnv)
  }))

  // B4 Firefly live is skipped without credentials; record N/A.
  scenarios.push({
    id: "B4-execute-firefly",
    samplesMs: [],
    medianMs: null,
    p95Ms: null,
    note: "Skipped: live Firefly credentials not available in CI/local Phase 5 gate.",
  })

  scenarios.push(await timeScenario("B5-execute-expr-warm", async () => {
    await runEcp(["execute", exprFixture, "--validate", "--json"], baseEnv)
  }))

  const startSamples = []
  const restartSamples = []
  for (let i = 0; i < Math.min(5, runs); i++) {
    await runEcp(["host", "stop", "--force", "--json"], baseEnv)
    const t0 = performance.now()
    await runEcp(["host", "start", "--json"], baseEnv)
    await waitHealthy(home)
    startSamples.push(performance.now() - t0)

    const t1 = performance.now()
    await runEcp(["host", "restart", "--force", "--json"], baseEnv)
    await waitHealthy(home)
    restartSamples.push(performance.now() - t1)
  }
  scenarios.push({
    id: "B6-host-start",
    samplesMs: startSamples.map(round),
    medianMs: median(startSamples),
    p95Ms: percentile(startSamples, 95),
  })
  scenarios.push({
    id: "B6-host-restart",
    samplesMs: restartSamples.map(round),
    medianMs: median(restartSamples),
    p95Ms: percentile(restartSamples, 95),
  })

  const schemaT0 = performance.now()
  await runEcp(["schema", "--json"], baseEnv)
  const schemaMs = performance.now() - schemaT0
  scenarios.push({
    id: "B7-schema",
    samplesMs: [round(schemaMs)],
    medianMs: round(schemaMs),
    p95Ms: round(schemaMs),
  })

  await runEcp(["host", "stop", "--force", "--json"], baseEnv)

  const b8 = await runB8({
    root,
    round,
    runEcp,
    waitHealthy,
    timeScenario,
    realPlugins: [
      { name: "@executioncontrolprotocol/plugin-test", root: pluginTest },
      { name: "@executioncontrolprotocol/plugin-anthropic", root: pluginAnthropic },
      { name: "@executioncontrolprotocol/plugin-azure-blob-storage", root: pluginAzure },
      { name: "@executioncontrolprotocol/plugin-adobe-firefly-services", root: pluginFirefly },
    ],
    echoFixture,
  })
  scenarios.push(...b8)
} finally {
  try {
    await runEcp(["host", "stop", "--force", "--json"], baseEnv)
  } catch {
    // ignore
  }
  await killRegisteredHostPidsBeforeRm(home, root)
}

const b3Cold = scenarios.find((s) => s.id === "B3-execute-echo-in-process")
const b3Warm = scenarios.find((s) => s.id === "B3-execute-echo-warm")
const warmSavingsMs =
  b3Cold?.medianMs != null && b3Warm?.medianMs != null ? b3Cold.medianMs - b3Warm.medianMs : null
const decision =
  warmSavingsMs != null && warmSavingsMs >= 300
    ? "auto-start-with-idle-shutdown"
    : "keep-in-process-fallback"
const decisionNote =
  decision === "keep-in-process-fallback"
    ? `Warm host saves ${warmSavingsMs?.toFixed?.(0) ?? "n/a"} ms median on B3 (< ~300 ms). Spec 10 discovery stays in-process when no host is running.`
    : `Warm host saves ${warmSavingsMs?.toFixed?.(0) ?? "n/a"} ms median on B3 (>= ~300 ms). Auto-start + idle shutdown should be implemented.`

const result = {
  date,
  os: platform(),
  runs,
  budgetsEnforced: true,
  warmSavingsMsB3: warmSavingsMs,
  decision,
  decisionNote,
  scenarios,
  mcpColumn: "N/A until Phase 6",
}

const resultFile = path.join(outDir, `${date}-${platform()}.json`)
writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`)
console.log(`bench: wrote ${path.relative(root, resultFile)}`)
console.log(`bench: decision=${decision} warmSavingsMsB3=${warmSavingsMs}`)

const budgetsPath = path.join(root, "bench", "budgets.json")
if (existsSync(budgetsPath)) {
  const budgets = JSON.parse(readFileSync(budgetsPath, "utf8"))
  const failures = []
  for (const [id, budget] of Object.entries(budgets.scenarios ?? {})) {
    const row = scenarios.find((s) => s.id === id)
    if (!row || row.medianMs == null) continue
    if (budget.medianMs != null && row.medianMs > budget.medianMs) {
      failures.push(`${id} median ${row.medianMs} > ${budget.medianMs}`)
    }
  }
  if (failures.length > 0) {
    console.error(`bench: budget failures:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    await killRegisteredHostPidsBeforeRm(home, root)
    rmSync(home, { recursive: true, force: true })
    process.exit(1)
  }
  console.log("bench: budgets ok")
}

await killRegisteredHostPidsBeforeRm(home, root)
rmSync(home, { recursive: true, force: true })

async function timeScenario(id, fn) {
  const samples = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    await fn()
    samples.push(performance.now() - t0)
  }
  return {
    id,
    samplesMs: samples.map(round),
    medianMs: median(samples),
    p95Ms: percentile(samples, 95),
  }
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2)
}

function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return round(sorted[idx])
}

function round(n) {
  return Math.round(n * 10) / 10
}

function runEcp(args, env) {
  return new Promise((resolve, reject) => {
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
      if (code === 0 || code === 2) resolve({ code, stderr })
      else reject(new Error(`ecp ${args.join(" ")} exited ${code}: ${stderr}`))
    })
  })
}

async function waitHealthy(homeDir, timeoutMs = 20_000) {
  const { checkHealth, readHostJson } = await import(pathToFileURL(path.join(root, "packages/host/dist/index.js")).href)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const file = readHostJson(homeDir)
    if (file) {
      const health = await checkHealth(`http://127.0.0.1:${file.port}`)
      if (health?.status === "ok") return
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error("host not healthy")
}
