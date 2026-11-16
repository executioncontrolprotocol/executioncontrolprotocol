// F: validate against the RAW accepts schema (no marker wrapping) and drop only the errors that a
// marker position explains. Includes anyOf/oneOf handling via schemaPath branches.
// G: Ajv standalone code for raw schemas (size and load time).
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { mkdirSync, writeFileSync, statSync } from "node:fs"
const require = createRequire(new URL("../../../packages/engine/package.json", import.meta.url))
const Ajv2020 = require("ajv/dist/2020").default
const standaloneCode = require("ajv/dist/standalone").default

const MARKER_KEYS = ["$ref", "$expr", "$state", "$script"]
const isMarker = v => v && typeof v === "object" && !Array.isArray(v) && MARKER_KEYS.some(k => k in v)
function markerPaths(v, p = "", out = new Set()) {
  if (isMarker(v)) { out.add(p); return out }
  if (Array.isArray(v)) v.forEach((x, i) => markerPaths(x, `${p}/${i}`, out))
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) markerPaths(x, `${p}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`, out)
  return out
}
const underMarker = (path, marks) => [...marks].some(m => path === m || path.startsWith(m + "/"))

/** Validate raw accepts; keep only errors not explained by a marker position. */
function validateWithMarkers(validate, input) {
  const marks = markerPaths(input)
  if (validate(input)) return []
  const errs = validate.errors
  const explained = e => underMarker(e.instancePath, marks) ||
    (e.keyword === "additionalProperties" && marks.has(`${e.instancePath}/${e.params.additionalProperty}`))
  // A combinator (anyOf/oneOf) failure is explained if some branch's errors are all explained.
  const comb = e => {
    if (!["anyOf", "oneOf"].includes(e.keyword)) return false
    const branches = new Map()
    for (const s of errs) if (s.schemaPath.startsWith(e.schemaPath + "/")) {
      const i = s.schemaPath.slice(e.schemaPath.length + 1).split("/")[0]
      if (!branches.has(i)) branches.set(i, [])
      branches.get(i).push(s)
    }
    return [...branches.values()].some(list => list.every(s => explained(s) || comb(s)))
  }
  return errs.filter(e => !explained(e) && !comb(e) && !(e.keyword === "if"))
    // drop sub-errors of explained combinators
    .filter(e => !errs.some(c => ["anyOf", "oneOf"].includes(c.keyword) && comb(c) && e.schemaPath.startsWith(c.schemaPath + "/")))
}

const schema = { type: "object", additionalProperties: false, required: ["prompt", "size", "outputs"], properties: {
  prompt: { type: "string", maxLength: 100 },
  size: { type: "object", additionalProperties: false, required: ["width"], properties: { width: { type: "integer" }, height: { type: "integer" } } },
  source: { anyOf: [ { type: "object", required: ["url"], additionalProperties: false, properties: { url: { type: "string" } } },
                     { type: "object", required: ["path"], additionalProperties: false, properties: { path: { type: "string" } } } ] },
  outputs: { type: "array", minItems: 1, items: { type: "object", required: ["mediaType"], properties: { mediaType: { enum: ["image/png", "image/jpeg"] } } } } } }
const ajv = new Ajv2020({ allErrors: true, strict: false })
const v = ajv.compile(schema)
const cases = [
  ["literals, valid", { prompt: "hi", size: { width: 1 }, outputs: [{ mediaType: "image/png" }] }, 0],
  ["markers at string, object, array-item, whole-array", { prompt: { $expr: "(s) => s.x" }, size: { $ref: "state.doc.size" }, outputs: { $ref: "state.outs" } }, 0],
  ["marker inside an anyOf branch", { prompt: "x", size: { width: { $ref: "state.w" } }, source: { url: { $ref: "state.u" } }, outputs: [{ mediaType: "image/png" }] }, 0],
  ["$script at a string", { prompt: { $script: { lang: "js", source: "x" } }, size: { width: 1 }, outputs: [{ mediaType: "image/jpeg" }] }, 0],
  ["typo field (must fail)", { promt: "x", size: { width: 1 }, outputs: [{ mediaType: "image/png" }] }, 2],
  ["bad enum next to a marker (must fail)", { prompt: { $ref: "state.p" }, size: { width: 1 }, outputs: [{ mediaType: "image/gif" }] }, 1],
  ["anyOf with no matching branch (must fail)", { prompt: "x", size: { width: 1 }, source: { file: "y" }, outputs: [{ mediaType: "image/png" }] }, 1],
  ["wrong literal type beside marker (must fail)", { prompt: 5, size: { $ref: "state.s" }, outputs: [{ mediaType: "image/png" }] }, 1],
]
let pass = 0
for (const [name, input, expectAtLeast] of cases) {
  const errs = validateWithMarkers(v, input)
  const ok = expectAtLeast === 0 ? errs.length === 0 : errs.length >= 1
  if (ok) pass++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${errs.length} error(s)${errs.length ? " -> " + errs.map(e => `${e.instancePath || "/"} ${e.message}`).join("; ") : ""}`)
}
console.log(`F correctness: ${pass}/${cases.length}`)

// G: standalone code for RAW schemas (20 Firefly-sized capabilities).
const leaf = k => (k % 4 === 0 ? { enum: ["a", "b", "c"] } : k % 4 === 1 ? { type: "integer", minimum: 0 } : k % 4 === 2 ? { type: "boolean" } : { type: "string", maxLength: 2000 })
const obj = (d, b) => ({ type: "object", additionalProperties: false, properties: Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`f${b}_${k}`, d > 0 && k === 0 ? obj(d - 1, b + 1) : leaf(k)])) })
const accepts = i => ({ $id: `ecp://plugins/p0/cap${i}.json`, type: "object", additionalProperties: false, required: ["image"], properties: { image: obj(2, 0), options: obj(2, 10), outputs: { type: "array", items: obj(1, 20) }, prompt: { type: "string" }, seed: { type: "integer" } } })
const a2 = new Ajv2020({ allErrors: true, strict: false, code: { source: true } })
const ids = {}; for (let i = 0; i < 20; i++) { a2.addSchema(accepts(i)); ids[`cap${i}`] = `ecp://plugins/p0/cap${i}.json` }
const dir = fileURLToPath(new URL("./out/", import.meta.url)); mkdirSync(dir, { recursive: true })
let t = performance.now(); writeFileSync(`${dir}/raw.validators.cjs`, standaloneCode(a2, ids)); const gen = performance.now() - t
t = performance.now(); const mod = createRequire(import.meta.url)(`${dir}/raw.validators.cjs`); const load = performance.now() - t
const one = []; for (let i = 0; i < 9; i++) { const a = new Ajv2020({ allErrors: true, strict: false }); const s = performance.now(); a.compile(accepts(i)); one.push(performance.now() - s) }
console.log(`G raw schemas: runtime compile per capability median ${one.sort((x, y) => x - y)[4].toFixed(1)} ms; standalone for 20 capabilities: ${(statSync(`${dir}/raw.validators.cjs`).size / 1024).toFixed(0)} KB, generated in ${gen.toFixed(0)} ms, loaded in ${load.toFixed(0)} ms; works: ${typeof mod.cap0 === "function"}`)
