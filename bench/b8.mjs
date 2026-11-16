/**
 * B8 — schema scale: synthetic on-disk plugins, real registry/host metrics.
 * Used by bench/run.mjs. Default N=1000; set ECP_BENCH_SCALE=5000 to also run 5k.
 */
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { performance } from "node:perf_hooks"

/** Capabilities per synthetic plugin (Firefly-sized). */
export const B8_CAPS_PER_PLUGIN = 20

/** Sample size for first-use / cached medians. */
const FIRST_USE_SAMPLE = 20

/** Host-start iterations for overhead (fewer than B1–B7). */
const START_ITERS = 3

/**
 * Which capability counts to measure.
 * Default: 1000. With `ECP_BENCH_SCALE=5000`, also 5000 (CI stays on 1k).
 */
export function b8Scales() {
  const scales = [1000]
  const env = process.env.ECP_BENCH_SCALE
  if (env === "5000" || env === "all") scales.push(5000)
  return scales
}

/**
 * Firefly-sized accepts (~40 leaves, nested objects/arrays/enums).
 * Ported from realignment/spikes/schema-scale/scale.mjs.
 */
export function fireflySizedAccepts() {
  const leaf = (k) =>
    k % 4 === 0
      ? { enum: ["a", "b", "c"] }
      : k % 4 === 1
        ? { type: "integer", minimum: 0 }
        : k % 4 === 2
          ? { type: "boolean" }
          : { type: "string", maxLength: 2000 }
  const obj = (depth, base) => ({
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      Array.from({ length: 8 }, (_, k) => [
        `f${base}_${k}`,
        depth > 0 && k === 0 ? obj(depth - 1, base + 1) : leaf(k),
      ]),
    ),
  })
  return {
    type: "object",
    additionalProperties: false,
    required: ["image"],
    properties: {
      image: obj(2, 0),
      options: obj(2, 10),
      outputs: { type: "array", items: obj(1, 20) },
      prompt: { type: "string" },
      seed: { type: "integer" },
    },
  }
}

/** Minimal valid input for {@link fireflySizedAccepts}. */
export function fireflySizedInput() {
  const leafVal = (k) => (k % 4 === 0 ? "a" : k % 4 === 1 ? 0 : k % 4 === 2 ? false : "x")
  const objVal = (depth, base) =>
    Object.fromEntries(
      Array.from({ length: 8 }, (_, k) => [
        `f${base}_${k}`,
        depth > 0 && k === 0 ? objVal(depth - 1, base + 1) : leafVal(k),
      ]),
    )
  return {
    image: objVal(2, 0),
    options: objVal(2, 10),
    outputs: [objVal(1, 20)],
    prompt: "bench",
    seed: 1,
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
  return `{${entries.join(",")}}`
}

function sha256HexSync(text) {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

/**
 * Write `pluginCount` synthetic user plugins under `dataDir/node_modules/@synth/`.
 * Registers them via `dataDir/package.json` dependencies (normal local discovery).
 */
export function generateSyntheticPlugins(dataDir, capabilityCount, capsPerPlugin = B8_CAPS_PER_PLUGIN) {
  const pluginCount = Math.ceil(capabilityCount / capsPerPlugin)
  const deps = {}
  const capabilityIds = []
  mkdirSync(path.join(dataDir, "node_modules", "@synth"), { recursive: true })

  for (let p = 0; p < pluginCount; p++) {
    const pkgName = `@synth/plugin-${p}`
    const pluginId = `@synth/plugin-${p}`
    const version = "1.0.0"
    const root = path.join(dataDir, "node_modules", "@synth", `plugin-${p}`)
    mkdirSync(root, { recursive: true })

    const start = p * capsPerPlugin
    const end = Math.min(capabilityCount, start + capsPerPlugin)
    const caps = []
    const defs = {
      config: { type: "object", additionalProperties: false, properties: {} },
    }
    for (let i = start; i < end; i++) {
      const name = `cap${i}`
      const id = `${pluginId}.${name}`
      capabilityIds.push(id)
      caps.push({
        id,
        name,
        summary: `Synthetic capability ${i}.`,
        description: `Firefly-sized synthetic capability ${i} for B8.`,
        useCases: ["B8 schema scale"],
        projections: ["Take ok"],
      })
      defs[`${name}.accepts`] = fireflySizedAccepts()
      defs[`${name}.returns`] = {
        type: "object",
        additionalProperties: false,
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
      }
    }
    caps.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

    const schemaDocument = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `ecp://plugins/${pluginId}/${version}/schema.json`,
      $defs: defs,
    }
    const schemaHash = sha256HexSync(canonicalJson(schemaDocument))

    const withoutHash = {
      schema: "@executioncontrolprotocol.plugin-manifest",
      version: "2.0",
      plugin: {
        id: pluginId,
        package: pkgName,
        version,
        summary: `Synthetic B8 plugin ${p}.`,
        description: `Synthetic plugin with Firefly-sized capabilities for B8 (${end - start} caps).`,
      },
      sdkVersion: "0.0.0-b8",
      pluginSchema: { path: "./ecp.schema.json", hash: schemaHash },
      capabilities: caps,
      entry: "./dist/index.js",
    }
    const hash = sha256HexSync(canonicalJson(withoutHash))
    const manifest = { ...withoutHash, hash }

    writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          name: pkgName,
          version,
          private: true,
          type: "module",
          ecp: { manifest: "./ecp.manifest.json", schema: "./ecp.schema.json" },
        },
        null,
        2,
      )}\n`,
    )
    writeFileSync(path.join(root, "ecp.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
    writeFileSync(path.join(root, "ecp.schema.json"), `${JSON.stringify(schemaDocument, null, 2)}\n`)
    deps[pkgName] = version
  }

  writeFileSync(
    path.join(dataDir, "package.json"),
    `${JSON.stringify({ private: true, dependencies: deps }, null, 2)}\n`,
  )

  return { pluginCount, capabilityCount: capabilityIds.length, capabilityIds }
}

function median(values, round) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const raw = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return round(raw)
}

function percentile(values, p, round) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return round(sorted[idx])
}

function pickSample(ids, n) {
  if (ids.length === 0) return []
  const count = Math.min(n, ids.length)
  const step = Math.max(1, Math.floor(ids.length / count))
  const out = []
  for (let i = 0; i < ids.length && out.length < count; i += step) out.push(ids[i])
  return out
}

function heapMb() {
  return Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 10) / 10
}

/**
 * Run B8 metrics for each scale and the warm-execute-all-plugins sub-metric.
 * @param {object} ctx
 * @param {string} ctx.root repo root
 * @param {function} ctx.round
 * @param {function} ctx.runEcp
 * @param {function} ctx.waitHealthy
 * @param {function} ctx.timeScenario
 * @param {Array<{ name: string, root: string }>} ctx.realPlugins linked real MVP plugins
 * @param {string} ctx.echoFixture
 */
export async function runB8(ctx) {
  const { root, round, runEcp, waitHealthy, timeScenario, realPlugins, echoFixture } = ctx
  const scenarios = []
  const { createLocalHost } = await import(
    pathToFileURL(path.join(root, "packages/host/dist/index.js")).href
  )
  const { HostSchemaSet } = await import(
    pathToFileURL(path.join(root, "packages/engine/dist/index.js")).href
  )
  const { PluginAdapter } = await import(
    pathToFileURL(path.join(root, "packages/protocol/dist/index.js")).href
  )

  // Empty-host registry baseline (timing.startMs only; excludes editor write).
  const emptySamples = []
  for (let i = 0; i < START_ITERS; i++) {
    const home = mkdtempSync(path.join(tmpdir(), "ecp-b8-empty-"))
    mkdirSync(path.join(home, "plugins"), { recursive: true })
    writeFileSync(path.join(home, "plugins", "package.json"), `${JSON.stringify({ private: true })}\n`)
    const host = await createLocalHost({ home, mode: "in-process" })
    emptySamples.push(host.timing.startMs)
    await host.stop()
    rmSync(home, { recursive: true, force: true })
  }
  const emptyMedian = median(emptySamples, round)
  scenarios.push({
    id: "B8-start-empty",
    samplesMs: emptySamples.map(round),
    medianMs: emptyMedian,
    p95Ms: percentile(emptySamples, 95, round),
    note: "createLocalHost timing.startMs with no plugins (registry/services only).",
  })

  for (const n of b8Scales()) {
    const tag = n === 1000 ? "1k" : n === 5000 ? "5k" : String(n)
    const home = mkdtempSync(path.join(tmpdir(), `ecp-b8-${tag}-`))
    const dataDir = path.join(home, "plugins")
    mkdirSync(dataDir, { recursive: true })
    const generated = generateSyntheticPlugins(dataDir, n)

    // Cold start: registry via timing.startMs; editor via timing.schemaMs.
    const startSamples = []
    const editorColdSamples = []
    let heapAfterStart = null
    let host = null
    for (let i = 0; i < START_ITERS; i++) {
      if (host) await host.stop()
      // Wipe editor stamp between cold iters except the last (kept for warm + validate).
      if (i > 0) {
        rmSync(path.join(home, "schema"), { recursive: true, force: true })
      }
      host = await createLocalHost({ home, mode: "in-process" })
      startSamples.push(host.timing.startMs)
      editorColdSamples.push(host.timing.schemaMs)
    }
    heapAfterStart = heapMb()
    const startMedian = median(startSamples, round)
    const overhead = emptyMedian != null && startMedian != null ? round(startMedian - emptyMedian) : null

    scenarios.push({
      id: `B8-start-${tag}`,
      samplesMs: startSamples.map(round),
      medianMs: startMedian,
      p95Ms: percentile(startSamples, 95, round),
      heapMb: heapAfterStart,
      plugins: generated.pluginCount,
      capabilities: generated.capabilityCount,
      note: `timing.startMs incl. registry load of ${generated.pluginCount} light manifests (${generated.capabilityCount} caps).`,
    })
    scenarios.push({
      id: `B8-start-overhead-${tag}`,
      samplesMs: startSamples.map((s) => round(s - emptyMedian)),
      medianMs: overhead,
      p95Ms: percentile(
        startSamples.map((s) => s - emptyMedian),
        95,
        round,
      ),
      note: `timing.startMs median minus empty (${emptyMedian} ms). Target ≤ ~100 ms at 5k.`,
    })
    scenarios.push({
      id: `B8-editor-write-cold-${tag}`,
      samplesMs: editorColdSamples.map(round),
      medianMs: median(editorColdSamples, round),
      p95Ms: percentile(editorColdSamples, 95, round),
      note: "createLocalHost timing.schemaMs on cold start (no stamp).",
    })

    // Warm editor rewrite (stamp match → ~0).
    const editorWarmSamples = []
    for (let i = 0; i < START_ITERS; i++) {
      await host.stop()
      host = await createLocalHost({ home, mode: "in-process" })
      editorWarmSamples.push(host.timing.schemaMs)
    }
    scenarios.push({
      id: `B8-editor-write-warm-${tag}`,
      samplesMs: editorWarmSamples.map(round),
      medianMs: median(editorWarmSamples, round),
      p95Ms: percentile(editorWarmSamples, 95, round),
      note: "createLocalHost timing.schemaMs with unchanged stamp (should be ~0).",
    })

    // First-use + cached validate on the real HostSchemaSet / registry.
    const plugins = host.services.get(PluginAdapter)
    const light = plugins.capabilities()
    const synthCaps = light.filter((c) => c.id.startsWith("@synth/"))
    if (synthCaps.length < generated.capabilityCount) {
      throw new Error(
        `B8 registry loaded ${synthCaps.length} synth caps, expected ${generated.capabilityCount}`,
      )
    }
    const schemas = await HostSchemaSet.create(synthCaps, {
      loadPluginSchema: (pluginId) => plugins.loadPluginSchema(pluginId),
      schemaFingerprints: plugins.schemaFingerprints(),
    })
    const sample = pickSample(synthCaps, FIRST_USE_SAMPLE)
    const input = fireflySizedInput()
    const firstUse = []
    for (const cap of sample) {
      const t0 = performance.now()
      await schemas.validateCapabilityInput(cap, input)
      firstUse.push(performance.now() - t0)
    }
    const heapAfterFirstUse = heapMb()
    const cached = []
    const cachedCap = sample[0]
    for (let i = 0; i < FIRST_USE_SAMPLE; i++) {
      const t0 = performance.now()
      await schemas.validateCapabilityInput(cachedCap, input)
      cached.push(performance.now() - t0)
    }

    scenarios.push({
      id: `B8-first-use-median-${tag}`,
      samplesMs: firstUse.map(round),
      medianMs: median(firstUse, round),
      p95Ms: percentile(firstUse, 95, round),
      heapMb: heapAfterFirstUse,
      sampleSize: sample.length,
      note: "Median first-use validateCapabilityInput (load plugin schema + compile accepts).",
    })
    // Alias without scale tag for the default 1k budget key used in budgets.json.
    if (n === 1000) {
      scenarios.push({
        id: "B8-first-use-median",
        samplesMs: firstUse.map(round),
        medianMs: median(firstUse, round),
        p95Ms: percentile(firstUse, 95, round),
        note: "Same as B8-first-use-median-1k (budget key).",
      })
      scenarios.push({
        id: "B8-cached-validate",
        samplesMs: cached.map(round),
        medianMs: median(cached, round),
        p95Ms: percentile(cached, 95, round),
        note: "Cached validateCapabilityInput on a warm capability (budget key).",
      })
    }
    scenarios.push({
      id: `B8-cached-validate-${tag}`,
      samplesMs: cached.map(round),
      medianMs: median(cached, round),
      p95Ms: percentile(cached, 95, round),
      note: "Cached validateCapabilityInput on a warm capability.",
    })
    scenarios.push({
      id: `B8-heap-after-start-${tag}`,
      samplesMs: [],
      medianMs: heapAfterStart,
      p95Ms: heapAfterStart,
      unit: "MB",
      note: "process.memoryUsage().heapUsed after cold start (soft; MB stored as medianMs).",
    })
    scenarios.push({
      id: `B8-heap-after-first-use-${tag}`,
      samplesMs: [],
      medianMs: heapAfterFirstUse,
      p95Ms: heapAfterFirstUse,
      unit: "MB",
      note: "Heap after first-use sample (soft; MB stored as medianMs).",
    })

    await host.stop()
    rmSync(home, { recursive: true, force: true })
  }

  // Warm ecp execute echo with all real MVP plugins linked (Group E sub-metric).
  const realHome = mkdtempSync(path.join(tmpdir(), "ecp-b8-real-"))
  const realData = path.join(realHome, "plugins")
  mkdirSync(realData, { recursive: true })
  writeFileSync(
    path.join(realData, "package.json"),
    `${JSON.stringify({
      private: true,
      oclif: {
        plugins: realPlugins.map((plugin) => ({
          type: "link",
          name: plugin.name,
          root: plugin.root,
        })),
      },
    })}\n`,
  )
  const realEnv = {
    ...process.env,
    ECP_HOME: realHome,
    ECP_DATA_DIR: realData,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  }
  try {
    await runEcp(["host", "start", "--json"], realEnv)
    await waitHealthy(realHome)
    scenarios.push(
      await timeScenario("B8-execute-echo-warm-all-plugins", async () => {
        await runEcp(["execute", echoFixture, "--json"], realEnv)
      }),
    )
    const last = scenarios[scenarios.length - 1]
    last.note = "Warm ecp execute echo with all real MVP plugins linked (F6 / Group E sub-metric)."
  } finally {
    try {
      await runEcp(["host", "stop", "--force", "--json"], realEnv)
    } catch {
      // ignore
    }
    rmSync(realHome, { recursive: true, force: true })
  }

  return scenarios
}
