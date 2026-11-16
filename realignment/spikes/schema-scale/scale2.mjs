// Follow-up: (C) lazy per-plugin schema loading, (D) raw accepts vs marker-wrapped compile cost,
// (E) Ajv standalone precompiled validators (generated at plugin build time) and their load cost.
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { mkdirSync, writeFileSync, statSync } from "node:fs"
const require = createRequire(new URL("../../../packages/engine/package.json", import.meta.url))
const Ajv2020 = require("ajv/dist/2020").default
const standaloneCode = require("ajv/dist/standalone").default

const N = Number(process.argv[2] ?? 5000), PER_PLUGIN = 20
const leaf = k => (k % 4 === 0 ? { enum: ["a", "b", "c"] } : k % 4 === 1 ? { type: "integer", minimum: 0 } : k % 4 === 2 ? { type: "boolean" } : { type: "string", maxLength: 2000 })
const obj = (d, b) => ({ type: "object", additionalProperties: false, properties: Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`f${b}_${k}`, d > 0 && k === 0 ? obj(d - 1, b + 1) : leaf(k)])) })
const accepts = () => ({ type: "object", additionalProperties: false, required: ["image"], properties: { image: obj(2, 0), options: obj(2, 10), outputs: { type: "array", items: obj(1, 20) }, prompt: { type: "string" }, seed: { type: "integer" } } })
const M = "ecp://protocol/markers.schema.json"
const markers = { $id: M, $defs: { ref: { type: "object", required: ["$ref"] }, expr: { type: "object", required: ["$expr"] }, state: { type: "object", required: ["$state"] }, script: { type: "object", required: ["$script"] } } }
function wrap(s) {
  if (!s || typeof s !== "object") return s
  const out = { ...s }
  if (out.properties) out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, wrap(v)]))
  if (out.items) out.items = wrap(out.items)
  const has = k => ({ type: "object", required: [k] })
  const tail = s.type === "string" ? { if: has("$script"), then: { $ref: `${M}#/$defs/script` }, else: out } : out
  return { if: has("$ref"), then: { $ref: `${M}#/$defs/ref` }, else: { if: has("$expr"), then: { $ref: `${M}#/$defs/expr` }, else: { if: has("$state"), then: { $ref: `${M}#/$defs/state` }, else: tail } } }
}
const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)]
const time = f => { const t = performance.now(); f(); return performance.now() - t }

// C: host start registers nothing per plugin; a plugin's schema is added on first use of any of its capabilities.
{
  const t0 = performance.now()
  const ajv = new Ajv2020({ allErrors: true, strict: false }); ajv.addSchema(markers)
  const loaded = new Set()
  const ensure = p => { if (!loaded.has(p)) { const $defs = {}; for (let i = p * PER_PLUGIN; i < (p + 1) * PER_PLUGIN; i++) $defs[`cap${i}`] = { accepts: wrap(accepts()) }; ajv.addSchema({ $id: `ecp://plugins/p${p}/schema.json`, $defs }); loaded.add(p) } }
  const start = performance.now() - t0
  const firstUse = [0, 7, 42, 120, 249].filter(p => p * PER_PLUGIN < N).map(p => time(() => { ensure(p); ajv.getSchema(`ecp://plugins/p${p}/schema.json#/$defs/cap${p * PER_PLUGIN}/accepts`) }))
  console.log(`C lazy plugin load, N=${N}: host start ${start.toFixed(1)} ms (independent of N); first use of a capability incl. loading its plugin schema median ${med(firstUse).toFixed(0)} ms; heap ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MB`)
}

// D: compile cost of raw accepts vs marker-wrapped accepts for one capability.
{
  const raw = [], wrapped = []
  for (let i = 0; i < 9; i++) {
    const a = new Ajv2020({ allErrors: true, strict: false }); a.addSchema(markers)
    raw.push(time(() => a.compile(accepts())))
    const b = new Ajv2020({ allErrors: true, strict: false }); b.addSchema(markers)
    wrapped.push(time(() => b.compile(wrap(accepts()))))
  }
  console.log(`D one capability: raw accepts compile median ${med(raw).toFixed(1)} ms; marker-wrapped compile median ${med(wrapped).toFixed(1)} ms; wrapped/raw size ${(JSON.stringify(wrap(accepts())).length / JSON.stringify(accepts()).length).toFixed(1)}x`)
}

// E: plugin build precompiles each capability validator with Ajv standalone; host loads the module on first use.
{
  const dir = fileURLToPath(new URL("./out/", import.meta.url)); mkdirSync(dir, { recursive: true })
  const ajv = new Ajv2020({ allErrors: true, strict: false, code: { source: true, esm: true } }); ajv.addSchema(markers)
  const schemas = {}; for (let i = 0; i < PER_PLUGIN; i++) schemas[`cap${i}`] = { $id: `ecp://plugins/p0/cap${i}.json`, ...wrap(accepts()) }
  for (const s of Object.values(schemas)) ajv.addSchema(s)
  const tBuild = time(() => writeFileSync(`${dir}/p0.validators.mjs`, standaloneCode(ajv, Object.fromEntries(Object.entries(schemas).map(([k, s]) => [k, s.$id])))))
  const kb = (statSync(`${dir}/p0.validators.mjs`).size / 1024).toFixed(0)
  console.log(`E standalone (marker-wrapped, plugin build): ${PER_PLUGIN} validators generate ${tBuild.toFixed(0)} ms and ${kb} KB of code; too large to ship, so loading is not measured (see scale3.mjs part G for raw schemas)`)
}
