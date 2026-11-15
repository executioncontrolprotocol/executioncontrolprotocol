/**
 * Phase 0 early measurements. Throwaway: not part of the workspace build.
 *
 * Times Ajv compiling a Firefly-sized generated schema (84 capabilities) and,
 * when the package can be installed, QuickJS WASM startup. The published CLI
 * cold start is recorded by the caller when `npx` is available.
 */
import { performance } from "node:perf_hooks"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

function time(label, fn) {
  const start = performance.now()
  const value = fn()
  const ms = performance.now() - start
  return { label, ms: Math.round(ms * 10) / 10, value }
}

const capabilityCount = 84
const properties = {}
for (let i = 0; i < 40; i += 1) properties[`field${i}`] = { type: "string" }
const capabilities = []
for (let i = 0; i < capabilityCount; i += 1) {
  capabilities.push({
    if: { properties: { uses: { const: `@executioncontrolprotocol/firefly.cap${i}` } }, required: ["uses"] },
    then: { properties: { input: { type: "object", properties, additionalProperties: false } } },
  })
}
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: { steps: { type: "array", items: { allOf: capabilities } } },
}

let Ajv
try {
  Ajv = require("ajv/dist/2020.js").default
} catch {
  console.log(JSON.stringify({ error: "ajv is not installed in this process" }))
  process.exit(1)
}

const compile = time("ajv-compile-84-capabilities", () => {
  const ajv = new Ajv({ allErrors: true, strict: false })
  return ajv.compile(schema)
})
const validate = time("ajv-validate-one", () =>
  compile.value({ steps: [{ uses: "@executioncontrolprotocol/firefly.cap0", input: { field0: "x" } }] }),
)

const report = {
  ajvCompileMs: compile.ms,
  ajvValidateMs: validate.ms,
  capabilityCount,
  perCapabilityCompileMs: Math.round((compile.ms / capabilityCount) * 1000) / 1000,
}

try {
  const { getQuickJS } = require("quickjs-emscripten")
  const start = performance.now()
  const runtime = await getQuickJS()
  report.quickJsStartMs = Math.round((performance.now() - start) * 10) / 10
  const evalStart = performance.now()
  const vm = runtime.newContext()
  const result = vm.evalCode("(state) => state.n + 1")
  report.quickJsEvalMs = Math.round((performance.now() - evalStart) * 10) / 10
  if (result.error) result.error.dispose()
  else result.value.dispose()
  vm.dispose()
  runtime.dispose()
} catch (error) {
  report.quickJs = `not measured: ${error instanceof Error ? error.message : String(error)}`
}

console.log(JSON.stringify(report, null, 2))
