// Validation-at-scale check on REAL data: every step in every fixture/example execution, validated
// (1) today's way (marker-wrapped accepts from generateExecutionSchema) and (2) the proposed way
// (raw accepts + marker-error filtering + $script position check + $secret/$env detection).
// Also times today's HostSchemaSet.create with all real capabilities (the per-operation cost).
// Run from the repo root after `pnpm run build`: node realignment/spikes/schema-scale/validate-real.mjs
import { createRequire } from "node:module"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const require = createRequire(path.join(root, "packages/engine/package.json"))
const Ajv2020 = require("ajv/dist/2020.js").default
const addFormats = require("ajv-formats").default
const engine = await import(pathToFileURL(path.join(root, "packages/engine/dist/index.js")).href)

// --- capabilities from every real manifest
const manifests = ["plugins", "fixtures/plugins"].flatMap(d => readdirSync(path.join(root, d)).map(p => path.join(root, d, p, "ecp.manifest.json")))
  .filter(f => { try { return statSync(f).isFile() } catch { return false } })
const caps = new Map()
for (const f of manifests) for (const c of JSON.parse(readFileSync(f, "utf8")).capabilities) caps.set(c.id, c)
console.log(`capabilities: ${caps.size} from ${manifests.length} manifests`)

// --- today's per-operation cost: HostSchemaSet.create with all real capabilities
const all = [...caps.values()]
const runs = []
for (let i = 0; i < 3; i++) { const t = performance.now(); await engine.HostSchemaSet.create(all); runs.push(performance.now() - t) }
console.log(`today: HostSchemaSet.create(all ${all.length}) per call: ${runs.map(x => x.toFixed(0)).join(", ")} ms (rebuilt on every execute/validate/commit)`)

// --- (1) today's wrapped validation, per capability
const wrappedCache = new Map()
function wrappedErrors(cap, input) {
  let v = wrappedCache.get(cap.id)
  if (!v) { const a = new Ajv2020({ allErrors: true, strict: false }); addFormats(a); v = a.compile(engine.generateExecutionSchema([cap])); wrappedCache.set(cap.id, v) }
  v({ schema: "@executioncontrolprotocol.execution", version: "2.0", steps: [{ id: "s", uses: cap.id, input }] })
  return (v.errors ?? []).filter(e => e.instancePath.startsWith("/steps/0/input"))
}

// --- (2) proposed: raw accepts + marker filtering
const MARKERS = ["$ref", "$expr", "$state", "$script", "$secret", "$env"]
const isMarker = v => v && typeof v === "object" && !Array.isArray(v) && MARKERS.some(k => k in v)
function markers(v, p = "", out = new Map()) {
  if (isMarker(v)) { out.set(p, MARKERS.find(k => k in v)); return out }
  if (Array.isArray(v)) v.forEach((x, i) => markers(x, `${p}/${i}`, out))
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) markers(x, `${p}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`, out)
  return out
}
// Subschemas reachable at a JSON Pointer (follows properties, items, additionalProperties, anyOf/oneOf/allOf).
function subschemasAt(schema, pointer) {
  let cur = [schema]
  for (const seg of pointer.split("/").slice(1).map(s => s.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    const next = []
    const visit = s => {
      if (!s || typeof s !== "object") return
      for (const k of ["anyOf", "oneOf", "allOf"]) if (Array.isArray(s[k])) s[k].forEach(visit)
      if (s.properties && seg in s.properties) next.push(s.properties[seg])
      else if (/^\d+$/.test(seg) && s.items) next.push(Array.isArray(s.items) ? s.items[Number(seg)] : s.items)
      else if (s.additionalProperties && typeof s.additionalProperties === "object") next.push(s.additionalProperties)
      // Open object (additionalProperties not false): an undeclared property accepts any value.
      else if (s.type === "object" || s.properties) { if (s.additionalProperties !== false) next.push(true) }
    }
    cur.forEach(visit); cur = next
  }
  return cur
}
const acceptsString = s => s === true || !s || (typeof s === "object" && (s.type === undefined || s.type === "string" || (Array.isArray(s.type) && s.type.includes("string")) || ["anyOf", "oneOf"].some(k => Array.isArray(s[k]) && s[k].some(acceptsString))))
const getAt = (v, p) => p.split("/").slice(1).reduce((x, k) => x?.[k.replace(/~1/g, "/").replace(/~0/g, "~")], v)
const rawCache = new Map()
function proposedErrors(cap, input) {
  let v = rawCache.get(cap.id)
  if (!v) { const a = new Ajv2020({ allErrors: true, strict: false }); addFormats(a); v = a.compile(cap.accepts); rawCache.set(cap.id, v) }
  const marks = markers(input)
  const extra = []
  for (const [p, kind] of marks) {
    if (kind === "$secret" || kind === "$env") extra.push({ instancePath: p, keyword: "marker", message: `${kind} not allowed in an execution` })
    // Marker syntax (as in protocol): $script needs lang "js" and exactly one of source/path.
    if (kind === "$script") { const sc = getAt(input, p).$script; if (!sc || typeof sc !== "object" || sc.lang !== "js" || ("source" in sc) === ("path" in sc)) extra.push({ instancePath: p, keyword: "marker", message: "$script needs lang js and exactly one of source or path" }) }
    if (kind === "$script" && !subschemasAt(cap.accepts, p).some(acceptsString)) extra.push({ instancePath: p, keyword: "marker", message: "$script where a string is not accepted" })
  }
  if (v(input)) return extra
  const errs = v.errors
  const under = p => [...marks.keys()].some(m => p === m || p.startsWith(m + "/"))
  const explained = e => under(e.instancePath) || (e.keyword === "additionalProperties" && marks.has(`${e.instancePath}/${e.params.additionalProperty}`))
  const comb = e => {
    if (!["anyOf", "oneOf"].includes(e.keyword)) return false
    const branches = new Map()
    for (const s of errs) if (s.schemaPath.startsWith(e.schemaPath + "/")) { const i = s.schemaPath.slice(e.schemaPath.length + 1).split("/")[0]; branches.set(i, [...(branches.get(i) ?? []), s]) }
    return [...branches.values()].some(list => list.every(s => explained(s) || comb(s)))
  }
  const explainedCombs = errs.filter(comb)
  return extra.concat(errs.filter(e => !explained(e) && !comb(e) && e.keyword !== "if" && !explainedCombs.some(c => e.schemaPath.startsWith(c.schemaPath + "/"))))
}

// --- walk every execution file
const files = []
const walk = d => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith(".ecp.json")) files.push(p) } }
walk(path.join(root, "fixtures")); walk(path.join(root, "examples"))
const steps = []
const collect = (nodes, file) => { for (const n of nodes ?? []) { if ((n.type ?? "step") === "step" && n.uses && caps.has(n.uses)) steps.push({ file, id: n.id, cap: caps.get(n.uses), input: n.input ?? {} }); if (n.steps) collect(n.steps, file); for (const b of n.branches ?? []) collect(Array.isArray(b) ? b : b.steps, file) } }
for (const f of files) { try { const m = JSON.parse(readFileSync(f, "utf8")); collect(m.steps, f) } catch { /* not JSON: load-error fixtures */ } }

let agree = 0, sameValidity = 0
const diffs = []
for (const s of steps) {
  const a = wrappedErrors(s.cap, s.input), b = proposedErrors(s.cap, s.input)
  const pa = new Set(a.map(e => e.instancePath.replace("/steps/0/input", ""))), pb = new Set(b.map(e => e.instancePath))
  const validA = a.length === 0, validB = b.length === 0
  if (validA === validB) sameValidity++
  if (validA === validB && [...pa].every(p => pb.has(p) || [...pb].some(q => p.startsWith(q + "/") || q.startsWith(p + "/")))) agree++
  else diffs.push(`${path.relative(root, s.file)} step ${s.id} (${s.cap.id}): today ${validA ? "valid" : [...pa].join(",") || "error"} | proposed ${validB ? "valid" : [...pb].join(",")}`)
}
console.log(`steps checked: ${steps.length} in ${files.length} files; same valid/invalid verdict: ${sameValidity}; same verdict and error locations: ${agree}`)
for (const d of diffs) console.log("  DIFF " + d)
const rawMs = [], wrapMs = []
for (const c of all) {
  let a = new Ajv2020({ allErrors: true, strict: false }); addFormats(a); let t = performance.now(); a.compile(c.accepts); rawMs.push(performance.now() - t)
  a = new Ajv2020({ allErrors: true, strict: false }); addFormats(a); t = performance.now(); a.compile(engine.generateExecutionSchema([c])); wrapMs.push(performance.now() - t)
}
const sum = a => a.reduce((x, y) => x + y, 0).toFixed(0)
console.log(`compile all ${all.length} real capabilities one by one: raw accepts ${sum(rawMs)} ms total (max ${Math.max(...rawMs).toFixed(0)} ms); wrapped ${sum(wrapMs)} ms total (max ${Math.max(...wrapMs).toFixed(0)} ms)`)
