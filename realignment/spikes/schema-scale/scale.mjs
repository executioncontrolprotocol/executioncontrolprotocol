// Schema scalability prototype: combined schema (today) vs per-plugin schemas with shared refs
// and lazy per-capability compilation (proposal). Usage: node scale.mjs <capabilities> [perPlugin]
import { createRequire } from "node:module"
const require = createRequire(new URL("../../../packages/engine/package.json", import.meta.url))
const Ajv2020 = require("ajv/dist/2020").default

const N = Number(process.argv[2] ?? 63)
const PER_PLUGIN = Number(process.argv[3] ?? 20)
const MODE = process.argv[4] ?? "both"

// A Firefly-sized capability input: nested objects, arrays, enums, ~40 leaf fields.
function capabilityAccepts() {
  const leaf = k => (k % 4 === 0 ? { enum: ["a", "b", "c"] } : k % 4 === 1 ? { type: "integer", minimum: 0 } : k % 4 === 2 ? { type: "boolean" } : { type: "string", maxLength: 2000 })
  const obj = (depth, base) => ({ type: "object", additionalProperties: false, properties: Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`f${base}_${k}`, depth > 0 && k === 0 ? obj(depth - 1, base + 1) : leaf(k)])) })
  return { type: "object", additionalProperties: false, required: ["image"], properties: {
    image: obj(2, 0), options: obj(2, 10), outputs: { type: "array", items: obj(1, 20) }, prompt: { type: "string" }, seed: { type: "integer" } } }
}

// Value markers: shared once, referenced everywhere.
const MARKERS_ID = "ecp://protocol/markers.schema.json"
const markers = { $id: MARKERS_ID, $defs: {
  ref: { type: "object", required: ["$ref"], additionalProperties: false, properties: { $ref: { type: "string", pattern: "^state(\\.[A-Za-z0-9_$-]+)+$" }, optional: { type: "boolean" }, fallback: {} } },
  expr: { type: "object", required: ["$expr"], additionalProperties: false, properties: { $expr: { type: "string", minLength: 1 } } },
  state: { type: "object", required: ["$state"], additionalProperties: false, properties: { $state: { type: "string" } } },
  script: { type: "object", required: ["$script"], additionalProperties: false, properties: { $script: { type: "object" } } },
} }

// Wrap a value position: dispatch on marker key, referencing the shared defs (not inlining them).
function wrap(s, refBase) {
  if (!s || typeof s !== "object") return s
  const out = { ...s }
  if (out.properties) out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, wrap(v, refBase)]))
  if (out.items) out.items = wrap(out.items, refBase)
  const has = k => ({ type: "object", required: [k] })
  const tail = s.type === "string" ? { if: has("$script"), then: { $ref: `${refBase}#/$defs/script` }, else: out } : out
  return { if: has("$ref"), then: { $ref: `${refBase}#/$defs/ref` }, else: { if: has("$expr"), then: { $ref: `${refBase}#/$defs/expr` }, else: { if: has("$state"), then: { $ref: `${refBase}#/$defs/state` }, else: tail } } }
}

const caps = Array.from({ length: N }, (_, i) => ({ id: `@vendor/p${Math.floor(i / PER_PLUGIN)}.cap${i}`, plugin: Math.floor(i / PER_PLUGIN), accepts: capabilityAccepts() }))
const sizeKb = o => (JSON.stringify(o).length / 1024).toFixed(0)
const mem = () => (process.memoryUsage().heapUsed / 1048576).toFixed(0)

const baseNodes = (stepInput) => ({
  nodes: { type: "array", items: { $ref: "#/$defs/node" } },
  node: { if: { properties: { type: { const: "branch" } }, required: ["type"] }, then: { $ref: "#/$defs/branch" }, else: { $ref: "#/$defs/step" } },
  branch: { type: "object", properties: { type: { const: "branch" }, id: { type: "string" }, branches: { type: "array", items: { type: "object", properties: { expr: { type: "string" }, steps: { $ref: "#/$defs/nodes" } } } } } },
  step: stepInput,
})

// --- A: today. One combined document schema with every capability's wrapped input inlined.
function combined() {
  const t0 = performance.now()
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  ajv.addSchema(markers)
  const step = { type: "object", required: ["id", "uses"], properties: { id: { type: "string" }, uses: { enum: caps.map(c => c.id) }, input: { type: "object" } },
    allOf: caps.map(c => ({ if: { properties: { uses: { const: c.id } }, required: ["uses"] }, then: { properties: { input: wrap(c.accepts, MARKERS_ID) } } })) }
  const schema = { $id: "ecp://host/execution.schema.json", type: "object", properties: { steps: { $ref: "#/$defs/nodes" } }, $defs: baseNodes(step) }
  try {
    ajv.compile(schema)
    console.log(`A combined   N=${N}: compile ${(performance.now() - t0).toFixed(0)} ms, schema ${sizeKb(schema)} KB, heap ${mem()} MB`)
  } catch (e) {
    console.log(`A combined   N=${N}: FAILED after ${(performance.now() - t0).toFixed(0)} ms: ${e.constructor.name}: ${String(e.message).slice(0, 80)}`)
  }
}

// --- B: proposal. Each plugin ships its own schema document ($id per plugin, $defs per capability,
// markers referenced by $id). Host: addSchema (no compile), small base validator, lazy per-capability compile.
function perPlugin() {
  const t0 = performance.now()
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  ajv.addSchema(markers)
  const plugins = new Map()
  for (const c of caps) {
    if (!plugins.has(c.plugin)) plugins.set(c.plugin, { $id: `ecp://plugins/p${c.plugin}/1.0.0/schema.json`, $defs: {} })
    plugins.get(c.plugin).$defs[c.id.split(".").pop()] = { accepts: wrap(c.accepts, MARKERS_ID) }
  }
  let bytes = 0
  for (const s of plugins.values()) { ajv.addSchema(s); bytes += JSON.stringify(s).length }
  const tAdd = performance.now()
  const step = { type: "object", required: ["id", "uses"], properties: { id: { type: "string" }, uses: { type: "string" }, input: { type: "object" } } }
  const base = ajv.compile({ $id: "ecp://host/execution.base.schema.json", type: "object", properties: { steps: { $ref: "#/$defs/nodes" } }, $defs: baseNodes(step) })
  const tBase = performance.now()
  // First use of 10 capabilities (an execution typically uses a handful).
  const sample = caps.filter((_, i) => i % Math.max(1, Math.floor(N / 10)) === 0).slice(0, 10)
  const times = sample.map(c => {
    const t = performance.now()
    const v = ajv.getSchema(`ecp://plugins/p${c.plugin}/1.0.0/schema.json#/$defs/${c.id.split(".").pop()}/accepts`)
    if (!v) throw new Error("missing " + c.id)
    v({ image: { source: "x" } })
    return performance.now() - t
  })
  const t2 = performance.now(); ajv.getSchema(`ecp://plugins/p${sample[0].plugin}/1.0.0/schema.json#/$defs/${sample[0].id.split(".").pop()}/accepts`); const cached = performance.now() - t2
  console.log(`B per-plugin N=${N} (${plugins.size} plugin schemas, ${(bytes / 1024).toFixed(0)} KB total): addSchema ${(tAdd - t0).toFixed(0)} ms, base compile ${(tBase - tAdd).toFixed(0)} ms, first-use compile per capability median ${times.sort((a, b) => a - b)[5].toFixed(1)} ms, cached ${cached.toFixed(2)} ms, heap ${mem()} MB`)
  void base
}

if (MODE !== "B") combined()
if (MODE !== "A") perPlugin()
