import { mkdirSync, writeFileSync, cpSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function write(rel, value) {
  const file = path.join(root, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  const text = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`
  writeFileSync(file, text)
}

const echo = (id, value = id, extra = {}) => ({
  id,
  uses: "@executioncontrolprotocol/test.echo",
  input: { value },
  as: id,
  ...extra,
})

const doc = (steps, execution) => ({
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  ...(execution ? { execution } : {}),
  steps,
})

const objectSchema = (properties, required) => ({
  type: "object",
  properties,
  ...(required ? { required } : {}),
})

write("fixtures/manifests/valid/smallest.ecp.json", doc([echo("echo", "hi")]))
write("fixtures/manifests/valid/branch.ecp.json", doc([
  {
    type: "branch",
    id: "route",
    branches: [
      { label: "yes", expr: "(state) => state.on === true", steps: [echo("yes", "yes")] },
      { label: "default", steps: [echo("no", "no")] },
    ],
  },
], { accepts: objectSchema({ on: { type: "boolean" } }, ["on"]) }))
write("fixtures/manifests/valid/loop.ecp.json", doc([
  {
    type: "loop",
    id: "refine",
    expr: "(state) => state.tick === undefined",
    maxRounds: 2,
    steps: [echo("tick", "tick", { mode: "replace" })],
  },
]))
write("fixtures/manifests/valid/parallel.ecp.json", doc([
  {
    type: "parallel",
    id: "prepare",
    maxConcurrency: 2,
    branches: [[echo("left", "left")], [echo("right", "right")]],
  },
]))
write("fixtures/manifests/valid/nested.ecp.json", doc([
  {
    type: "parallel",
    id: "outer",
    branches: [
      [{
        type: "loop",
        id: "inner",
        expr: "(state) => state.n === undefined",
        maxRounds: 1,
        steps: [{
          type: "branch",
          id: "arm",
          branches: [
            { label: "default", steps: [echo("nested", "nested")] },
          ],
        }],
      }],
      [echo("side", "side")],
    ],
  },
]))
write("fixtures/manifests/valid/markers.ecp.json", doc([
  echo("seed", "seed"),
  {
    id: "marked",
    uses: "@executioncontrolprotocol/test.echo",
    input: {
      fromRef: { $ref: "state.seed.echo", optional: true, fallback: "missing" },
      fromExpr: { $expr: "(state) => state.seed.echo" },
      handle: { $state: "bucket" },
      script: { $script: { lang: "js", source: "1" } },
    },
    as: "marked",
  },
]))
write("fixtures/manifests/valid/commit-modes.ecp.json", doc([
  echo("created", "a", { mode: "create" }),
  echo("created", "b", { mode: "replace", id: "replaced" }),
  { id: "merged", uses: "@executioncontrolprotocol/test.echo", input: { value: { extra: 1 } }, as: "created", mode: "merge" },
  echo("created", "c", { mode: "append", id: "appended" }),
]))
write("fixtures/manifests/valid/banner.js", "return 1\n")
write("fixtures/manifests/valid/script-source.ecp.json", doc([
  {
    id: "scripted",
    uses: "@executioncontrolprotocol/test.bounded",
    input: { text: { $script: { lang: "js", source: "1" } } },
    as: "scripted",
  },
]))
write("fixtures/manifests/valid/script-path.ecp.json", doc([
  {
    id: "scripted",
    uses: "@executioncontrolprotocol/test.bounded",
    input: { text: { $script: { lang: "js", path: "banner.js" } } },
    as: "scripted",
  },
]))
write("fixtures/manifests/valid/optional-fallback.ecp.json", doc([
  {
    id: "echo",
    uses: "@executioncontrolprotocol/test.echo",
    input: { value: { $ref: "state.missing", optional: true, fallback: "fallback" } },
    as: "echo",
  },
]))

write("fixtures/manifests/valid/localize-banner.ecp.json", {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  execution: {
    id: "localize-banner",
    label: "Localize campaign banner",
    description: "Reference execution covering every manifest feature.",
    accepts: objectSchema({
      locale: { type: "string" },
      headline: { type: "string" },
    }, ["locale"]),
    returns: objectSchema({
      headline: { type: "string" },
      banner: { type: "object" },
    }, ["headline", "banner"]),
  },
  steps: [
    {
      id: "doc",
      uses: "@executioncontrolprotocol/test.echo",
      input: {
        value: {
          headline: { $ref: "state.headline", optional: true, fallback: "Hello" },
          locale: { $ref: "state.locale" },
        },
      },
      as: "doc",
      mode: "create",
    },
    {
      id: "translate",
      label: "Translate headline",
      uses: "@executioncontrolprotocol/anthropic.generate",
      config: "anthropic/default",
      expr: "(state) => state.locale !== 'en'",
      input: { prompt: { $expr: "(state) => `Translate: ${state.doc.echo.headline}`" } },
      as: "translation",
      mode: "replace",
    },
    {
      type: "branch",
      id: "check-headline",
      branches: [
        { label: "missing", expr: "(state) => !state.doc.echo.headline", steps: [echo("filled", "Untitled")] },
        { label: "default", steps: [echo("kept", "kept")] },
      ],
    },
    {
      type: "parallel",
      id: "prepare",
      maxConcurrency: 2,
      branches: [
        [echo("copy", "copy")],
        [{
          id: "script",
          uses: "@executioncontrolprotocol/adobe-firefly-services.photoshop-actions",
          input: {
            options: {
              uxp: {
                source: {
                  content: { $script: { lang: "js", path: "banner.js" } },
                },
              },
            },
          },
          as: "actions",
        }],
      ],
    },
    {
      type: "loop",
      id: "refine",
      expr: "(state) => state.score === undefined",
      maxRounds: 3,
      steps: [
        {
          id: "score",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $expr: "(state) => 1" } },
          as: "score",
          mode: "replace",
        },
      ],
    },
    {
      id: "stage",
      uses: "@executioncontrolprotocol/test.stage",
      input: { handle: { $state: "history" }, op: "append", value: "noted" },
      as: "staged",
    },
    {
      id: "headline",
      uses: "@executioncontrolprotocol/test.echo",
      input: { value: { $ref: "state.doc.echo.headline" } },
      as: "headline",
      mode: "replace",
    },
    {
      id: "banner",
      uses: "@executioncontrolprotocol/test.echo",
      input: { value: { ok: true } },
      as: "banner",
      mode: "create",
    },
  ],
})

function invalid(name, manifest, issues) {
  write(`fixtures/manifests/invalid/${name}.ecp.json`, manifest)
  write(`fixtures/manifests/invalid/${name}.expected.json`, issues)
}

const baseStep = echo("echo", "hi")
invalid("schema-version", { ...doc([baseStep]), version: "1.0" }, [
  { code: "ECP_MANIFEST_INVALID", path: "/version", severity: "error" },
])
invalid("schema-type-workflow", { ...doc([baseStep]), type: "workflow" }, [
  { code: "ECP_MANIFEST_INVALID", path: "/type", severity: "error" },
])
invalid("schema-secret", doc([{ ...baseStep, input: { value: { $secret: "test.secret" } } }]), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps/0/input/value", severity: "error" },
])
invalid("schema-env", doc([{ ...baseStep, input: { value: { $env: "PATH" } } }]), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps/0/input/value", severity: "error" },
])
invalid("schema-when", doc([{ ...baseStep, when: "(state) => true" }]), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps/0/when", severity: "error" },
])
invalid("schema-until", doc([{
  type: "loop", id: "refine", expr: "(state) => false", maxRounds: 1, until: "(state) => true", steps: [baseStep],
}]), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps/0/until", severity: "error" },
])
invalid("schema-mode-version", doc([{ ...baseStep, mode: "version" }]), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps/0/mode", severity: "error" },
])
invalid("schema-unknown-property", { ...doc([baseStep]), extra: true }, [
  { code: "ECP_MANIFEST_INVALID", path: "/extra", severity: "error" },
])
invalid("schema-missing-steps", { schema: "@executioncontrolprotocol.execution", version: "2.0" }, [
  { code: "ECP_MANIFEST_INVALID", path: "/steps", severity: "error" },
])
invalid("schema-empty-steps", doc([]), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps", severity: "error" },
])
invalid("schema-maxrounds-zero", doc([{
  type: "loop", id: "refine", expr: "(state) => true", maxRounds: 0, steps: [baseStep],
}]), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps/0/maxRounds", severity: "error" },
])
invalid("schema-script-both", doc([{
  id: "scripted",
  uses: "@executioncontrolprotocol/test.bounded",
  input: { text: { $script: { lang: "js", source: "1", path: "banner.js" } } },
  as: "scripted",
}]), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps/0/input/text/$script", severity: "error" },
])

function later(name, manifest, issues) {
  invalid(name, manifest, issues)
}

later("duplicate-id", doc([echo("echo", "a"), { ...echo("echo", "b"), id: "again" }].map((node, index) => index === 1 ? { ...node, id: "echo" } : node)), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps/1/id", severity: "error" },
])
later("default-arm-not-last", doc([{
  type: "branch",
  id: "route",
  branches: [
    { label: "default", steps: [echo("no", "no")] },
    { label: "yes", expr: "(state) => true", steps: [echo("yes", "yes")] },
  ],
}]), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps/0/branches/0", severity: "error" },
])
later("mode-without-as", doc([{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "hi" }, mode: "replace" }]), [
  { code: "ECP_MANIFEST_INVALID", path: "/steps/0/mode", severity: "error" },
])
later("unknown-capability", doc([{ id: "echo", uses: "@executioncontrolprotocol/missing.echo", input: { value: "hi" }, as: "echo" }]), [
  { code: "ECP_CAPABILITY_UNKNOWN", path: "/steps/0/uses", severity: "error" },
])
later("plugins-missing", doc([{ id: "gen", uses: "@executioncontrolprotocol/anthropic.generate", input: { prompt: "hi" }, as: "out" }]), [
  { code: "ECP_PLUGINS_MISSING", path: "/steps/0/uses", severity: "error" },
])
later("input-type", doc([{ id: "bounded", uses: "@executioncontrolprotocol/test.bounded", input: { text: 1 }, as: "out" }]), [
  { code: "ECP_INPUT_INVALID", path: "/steps/0/input/text", severity: "error" },
])
later("expr-syntax", doc([echo("echo", "hi", { expr: "(state) =>" })]), [
  { code: "ECP_EXPR_INVALID", path: "/steps/0/expr", severity: "error" },
])
later("expr-two-params", doc([echo("echo", "hi", { expr: "(a, b) => true" })]), [
  { code: "ECP_EXPR_INVALID", path: "/steps/0/expr", severity: "error" },
])
later("expr-async", doc([echo("echo", "hi", { expr: "async (state) => true" })]), [
  { code: "ECP_EXPR_INVALID", path: "/steps/0/expr", severity: "error" },
])
later("script-syntax", doc([{
  id: "scripted",
  uses: "@executioncontrolprotocol/test.bounded",
  input: { text: { $script: { lang: "js", source: "function (" } } },
  as: "out",
}]), [
  { code: "ECP_SCRIPT_INVALID", path: "/steps/0/input/text/$script/source", severity: "error" },
])
later("ref-unresolved", doc([{
  id: "echo",
  uses: "@executioncontrolprotocol/test.echo",
  input: { value: { $ref: "state.later" } },
  as: "echo",
}]), [
  { code: "ECP_REF_UNRESOLVED", path: "/steps/0/input/value/$ref", severity: "error" },
])
later("ref-maybe-missing", doc([
  echo("gated", "x", { expr: "(state) => false" }),
  {
    id: "after",
    uses: "@executioncontrolprotocol/test.echo",
    input: { value: { $ref: "state.gated" } },
    as: "after",
  },
]), [
  { code: "ECP_REF_MAYBE_MISSING", path: "/steps/1/input/value/$ref", severity: "error" },
])
later("commit-conflict", doc([
  echo("same", "a", { mode: "create" }),
  echo("same", "b", { mode: "create", id: "again" }),
]), [
  { code: "ECP_COMMIT_CONFLICT", path: "/steps/1/as", severity: "error" },
])
later("returns-unresolved", doc([echo("echo", "hi")], {
  id: "missing-return",
  returns: objectSchema({ missing: { type: "string" } }, ["missing"]),
}), [
  { code: "ECP_RETURNS_UNRESOLVED", path: "/execution/returns/properties/missing", severity: "error" },
])

function run(name, manifest, expected) {
  write(`fixtures/manifests/runs/${name}.ecp.json`, manifest)
  write(`fixtures/manifests/runs/${name}.run.json`, expected)
}

const completed = (steps, result, events) => ({ input: {}, status: "completed", result, steps, events })

run("echo", doc([echo("echo", "hi")]), completed(
  [{ nodeId: "echo", status: "completed" }],
  { echo: { echo: "hi" } },
  ["run.start", "step.start", "step.end", "run.end"],
))
run("skip", doc([echo("echo", "hi", { expr: "(state) => false" })]), {
  input: {},
  status: "completed",
  result: {},
  steps: [{ nodeId: "echo", status: "skipped" }],
  events: ["run.start", "step.skip", "run.end"],
})
run("branch-none", doc([{
  type: "branch",
  id: "route",
  branches: [{ label: "only", expr: "(state) => false", steps: [echo("yes", "yes")] }],
}]), {
  input: {},
  status: "completed",
  result: {},
  steps: [],
  events: ["run.start", "branch.select", "run.end"],
})
run("loop-exhausted", doc([{
  type: "loop",
  id: "refine",
  expr: "(state) => true",
  maxRounds: 1,
  steps: [echo("tick", "tick", { mode: "replace" })],
}]), completed(
  [{ nodeId: "tick", status: "completed", round: 0 }],
  { tick: { echo: "tick" } },
  ["run.start", "loop.round", "step.start", "step.end", "loop.exhausted", "run.end"],
))
run("parallel-failure", doc([{
  type: "parallel",
  id: "both",
  branches: [
    [{ id: "slow", uses: "@executioncontrolprotocol/test.delay", input: { ms: 5000 }, as: "slow" }],
    [{ id: "bad", uses: "@executioncontrolprotocol/test.fail", input: { code: "ECP_STEP_FAILED" }, as: "bad" }],
  ],
}]), {
  input: {},
  status: "failed",
  result: {},
  steps: [
    { nodeId: "slow", status: "cancelled" },
    { nodeId: "bad", status: "failed" },
  ],
  events: ["run.start", "step.start", "step.start", "step.error", "run.end"],
})
run("commit-replace", doc([
  echo("slot", "a", { mode: "create" }),
  echo("slot", "b", { mode: "replace", id: "second" }),
]), completed(
  [{ nodeId: "slot", status: "completed" }, { nodeId: "second", status: "completed" }],
  { slot: { echo: "b" } },
  ["run.start", "step.start", "step.end", "step.start", "step.end", "run.end"],
))

const cap = (name, accepts, returns, extra = {}) => ({
  id: `@executioncontrolprotocol/test.${name}`,
  name,
  summary: `${name} fixture capability.`,
  description: `Deterministic ${name} capability for engine tests.`,
  useCases: [`Exercise ${name}.`],
  projections: ["Use the returned object."],
  accepts,
  returns,
  ...extra,
})

write("fixtures/plugins/fixture-plugin/ecp.manifest.json", {
  schema: "@executioncontrolprotocol.plugin-manifest",
  version: "1.0",
  plugin: {
    id: "@executioncontrolprotocol/test",
    package: "@executioncontrolprotocol/plugin-test",
    version: "2.0.0",
    summary: "Fixture capabilities for engine tests.",
    description: "Echo, fail, delay, stage, config echo, file round-trip, call and a length-limited string.",
  },
  sdkVersion: "2.0.0",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      secret: { type: "string" },
      label: { type: "string" },
    },
  },
  capabilities: [
    cap("echo", { type: "object", properties: { value: {} } }, { type: "object", required: ["echo"], properties: { echo: {} } }),
    cap("fail", { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } }, { type: "object", properties: {} }),
    cap("delay", { type: "object", required: ["ms"], properties: { ms: { type: "integer", minimum: 0 } } }, { type: "object", required: ["waitedMs"], properties: { waitedMs: { type: "integer" } } }, { timeoutMs: 1000 }),
    cap("stage", {
      type: "object",
      required: ["handle", "op", "value"],
      properties: {
        handle: { type: "object" },
        op: { enum: ["set", "merge", "append"] },
        value: {},
      },
    }, { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } }),
    cap("config-echo", { type: "object", additionalProperties: false, properties: {} }, {
      type: "object",
      required: ["keys", "secretLength"],
      properties: { keys: { type: "array", items: { type: "string" } }, secretLength: { type: "integer" } },
    }),
    cap("file-roundtrip", { type: "object", required: ["file"], properties: { file: { type: "object" } } }, {
      type: "object",
      required: ["artifact"],
      properties: { artifact: { type: "object" } },
    }),
    cap("call", { type: "object", required: ["capabilityId", "input"], properties: { capabilityId: { type: "string" }, input: {} } }, {
      type: "object",
      required: ["result"],
      properties: { result: {} },
    }),
    cap("bounded", { type: "object", required: ["text"], additionalProperties: false, properties: { text: { type: "string", maxLength: 40 } } }, {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" } },
    }),
  ],
  entry: "./dist/index.js",
  hash: "fixture",
})

write("fixtures/plugins/fixture-creative/ecp.manifest.json", {
  schema: "@executioncontrolprotocol.plugin-manifest",
  version: "1.0",
  plugin: {
    id: "@executioncontrolprotocol/fixture-creative",
    package: "@executioncontrolprotocol/fixture-creative",
    version: "2.0.0",
    summary: "Stand-in shapes for Anthropic and Firefly steps in fixtures.",
    description: "Not a runtime plugin. Declares the capability shapes localize-banner references.",
  },
  sdkVersion: "2.0.0",
  capabilities: [
    {
      id: "@executioncontrolprotocol/anthropic.generate",
      name: "generate",
      summary: "Generate text.",
      description: "Fixture shape for an Anthropic generate call.",
      useCases: ["Translate a headline."],
      projections: ["Take the text field."],
      accepts: { type: "object", required: ["prompt"], properties: { prompt: { type: "string" } } },
      returns: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
    },
    {
      id: "@executioncontrolprotocol/adobe-firefly-services.photoshop-actions",
      name: "photoshop-actions",
      summary: "Run a Photoshop action.",
      description: "Fixture shape. options.uxp.source.content is a string so executions can pass $script.",
      useCases: ["Apply a banner action."],
      projections: ["Take the document ref."],
      accepts: {
        type: "object",
        properties: {
          options: {
            type: "object",
            properties: {
              uxp: {
                type: "object",
                properties: { source: { type: "object", properties: { content: { type: "string", maxLength: 200000 } } } },
              },
            },
          },
        },
      },
      returns: { type: "object", properties: { document: { type: "object" } } },
    },
  ],
  entry: "./dist/index.js",
  hash: "fixture-creative",
})

const v1 = [
  ["01-echo", "workflow.ecp.ts"],
  ["02-weekly-brief", "workflow.ecp.ts"],
  ["03-secrets-bind", "workflow.ecp.ts"],
  ["06-invoke", "workflow.ecp.ts"],
  ["07-accepts-returns", "workflow.ecp.ts"],
  ["08-branch-loop", "workflow.ecp.ts"],
  ["dogfood/01-reshape.ecp.ts", "01-reshape.ecp.ts"],
  ["dogfood/01-reshape.fail.ecp.ts", "01-reshape.fail.ecp.ts"],
  ["dogfood/02-photo.ecp.ts", "02-photo.ecp.ts"],
  ["dogfood/02-photo.fail.ecp.ts", "02-photo.fail.ecp.ts"],
  ["dogfood/03-caption.ecp.ts", "03-caption.ecp.ts"],
]
for (const [from, to] of v1) {
  const src = from.includes("dogfood/")
    ? path.join(root, "legacy/examples", from)
    : path.join(root, "legacy/examples", from, to)
  const destName = from.includes("dogfood/") ? to : `${from}.ecp.ts`
  const dest = path.join(root, "fixtures/v1", destName)
  mkdirSync(path.dirname(dest), { recursive: true })
  cpSync(src, dest)
}

write("fixtures/v1/01-echo.ecp.json", doc([
  { id: "Echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "hello from fluent API" }, as: "echo" },
]))
write("fixtures/v1/01-echo.run.json", completed(
  [{ nodeId: "Echo", status: "completed" }],
  { echo: { echo: "hello from fluent API" } },
  ["run.start", "step.start", "step.end", "run.end"],
))
write("fixtures/v1/02-weekly-brief.ecp.json", doc([
  {
    id: "Generate",
    label: "Generate Executive Brief",
    uses: "@executioncontrolprotocol/openai.generate",
    config: "openai/default",
    input: { prompt: "Create a concise leadership brief.", context: { $ref: "state.signals" } },
    as: "brief",
  },
], { id: "weekly-brief", label: "Weekly leadership brief", accepts: objectSchema({ signals: { type: "array" } }, ["signals"]) }))
write("fixtures/v1/02-weekly-brief.run.json", {
  input: { signals: ["a"] },
  status: "completed",
  result: { brief: { text: "brief" } },
  steps: [{ nodeId: "Generate", status: "completed" }],
  events: ["run.start", "step.start", "step.end", "run.end"],
  note: "OpenAI is not an MVP plugin. Phase 8 records the live result or keeps this as a shape fixture.",
})
write("fixtures/v1/03-secrets-bind.ecp.json", doc([
  { id: "Echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "secrets are bound in the environment, not this workflow" }, as: "echo" },
]))
write("fixtures/v1/03-secrets-bind.run.json", completed(
  [{ nodeId: "Echo", status: "completed" }],
  { echo: { echo: "secrets are bound in the environment, not this workflow" } },
  ["run.start", "step.start", "step.end", "run.end"],
))
write("fixtures/v1/06-invoke.ecp.json", doc([
  { id: "Echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "unused in invoke path" }, as: "echo" },
]))
write("fixtures/v1/06-invoke.run.json", completed(
  [{ nodeId: "Echo", status: "completed" }],
  { echo: { echo: "unused in invoke path" } },
  ["run.start", "step.start", "step.end", "run.end"],
))
write("fixtures/v1/07-accepts-returns.ecp.json", doc([
  { id: "Echo", uses: "@executioncontrolprotocol/test.echo", input: { value: { $ref: "state.value" } }, as: "echo" },
], {
  id: "echo-from-input",
  label: "Echo from input",
  accepts: objectSchema({ value: { type: "string" } }, ["value"]),
  returns: objectSchema({ echo: { type: "object" } }, ["echo"]),
}))
write("fixtures/v1/07-accepts-returns.run.json", {
  input: { value: "from-input" },
  status: "completed",
  result: { echo: { echo: "from-input" } },
  steps: [{ nodeId: "Echo", status: "completed" }],
  events: ["run.start", "step.start", "step.end", "run.end"],
})
write("fixtures/v1/08-branch-loop.ecp.json", doc([
  echo("Seed", "seed"),
  {
    type: "branch",
    id: "route",
    branches: [
      { label: "expand", expr: "(state) => state.expand === true", steps: [echo("expanded", "expanded")] },
      { label: "compact", expr: "(state) => state.expand === false", steps: [echo("compact", "skipped-arm")] },
    ],
  },
  echo("gated", "only-when-expand", { expr: "(state) => state.expand === true" }),
  {
    type: "loop",
    id: "retry",
    label: "retry",
    expr: "(state) => state.tick === undefined || state.tick.echo !== 'tick'",
    maxRounds: 2,
    steps: [echo("tick", "tick", { mode: "replace" })],
  },
], {
  id: "branch-and-loop",
  label: "Branch and loop demo",
  accepts: objectSchema({ expand: { type: "boolean" }, message: { type: "string" } }, ["expand"]),
  returns: objectSchema({ seed: { type: "object" } }),
}))
write("fixtures/v1/08-branch-loop.run.json", {
  input: { expand: true },
  status: "completed",
  result: { seed: { echo: "seed" } },
  steps: [
    { nodeId: "Seed", status: "completed" },
    { nodeId: "expanded", status: "completed" },
    { nodeId: "gated", status: "completed" },
    { nodeId: "tick", status: "completed", round: 0 },
  ],
  events: ["run.start", "step.start", "step.end", "branch.select", "step.start", "step.end", "step.start", "step.end", "loop.round", "step.start", "step.end", "run.end"],
})

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
write("fixtures/v1/dogfood-01-reshape.ecp.json", doc([
  {
    id: "Reshape",
    uses: "@executioncontrolprotocol/jsonata.transform",
    input: { expression: '{ "title": items[0].title, "count": $count(items) }', payload: { items: [{ title: "Widget" }, { title: "Gadget" }] } },
    as: "summary",
  },
]))
write("fixtures/v1/dogfood-01-reshape.run.json", {
  input: {},
  status: "completed",
  result: { summary: { title: "Widget", count: 2 } },
  steps: [{ nodeId: "Reshape", status: "completed" }],
  events: ["run.start", "step.start", "step.end", "run.end"],
})
write("fixtures/v1/dogfood-01-reshape-fail.ecp.json", doc([
  {
    id: "Reshape",
    uses: "@executioncontrolprotocol/jsonata.transform",
    input: { expression: "$assert($exists(payload.export.summary), \"wrong path\")", payload: { items: [{ title: "Widget" }] } },
    as: "summary",
  },
]))
write("fixtures/v1/dogfood-01-reshape-fail.run.json", {
  input: {},
  status: "failed",
  result: {},
  steps: [{ nodeId: "Reshape", status: "failed" }],
  events: ["run.start", "step.start", "step.error", "run.end"],
})
write("fixtures/v1/dogfood-02-photo.ecp.json", doc([
  {
    id: "Resize",
    uses: "@executioncontrolprotocol/image-sharp.resize",
    input: { contentBase64: png, mediaType: "image/png", width: 64, height: 64, fit: "cover", output: { format: "webp", quality: 80 } },
    as: "thumb",
  },
  {
    id: "Upload",
    uses: "@executioncontrolprotocol/azure-blob-storage.upload",
    config: "azure-blob-storage/default",
    input: { contentBase64: png, contentType: "image/png", blobName: "product.webp", createReadSas: true },
    as: "upload",
  },
]))
write("fixtures/v1/dogfood-02-photo.run.json", {
  input: {},
  status: "completed",
  result: { thumb: { mediaType: "image/webp" }, upload: { blobName: "product.webp" } },
  steps: [{ nodeId: "Resize", status: "completed" }, { nodeId: "Upload", status: "completed" }],
  events: ["run.start", "step.start", "step.end", "step.start", "step.end", "run.end"],
  note: "Policy step removed. Connection string moved to config azure-blob-storage/default. Buffer refs became contentBase64.",
})
write("fixtures/v1/dogfood-02-photo-fail.ecp.json", doc([
  {
    id: "Resize",
    uses: "@executioncontrolprotocol/image-sharp.resize",
    input: { contentBase64: png, mediaType: "image/png", width: 64, height: 64, fit: "cover", output: { format: "webp", quality: 80 } },
    as: "thumb",
  },
  {
    id: "Upload",
    uses: "@executioncontrolprotocol/azure-blob-storage.upload",
    config: "azure-blob-storage/default",
    input: { filePath: { $ref: "state.thumb" }, contentType: "image/png", blobName: "product.webp", createReadSas: true },
    as: "upload",
  },
]))
write("fixtures/v1/dogfood-02-photo-fail.run.json", {
  input: {},
  status: "failed",
  result: {},
  steps: [],
  events: ["run.start", "run.end"],
  note: "Expected to fail validation: filePath is a string and thumb is an object (ECP_TYPE_MISMATCH).",
})
write("fixtures/v1/dogfood-03-caption.ecp.json", doc([
  {
    id: "Caption",
    uses: "@executioncontrolprotocol/ollama.generate",
    config: "ollama/default",
    input: { prompt: "Write a one-sentence product caption for a 64px thumbnail of a widget.", model: "llama3.2" },
    as: "caption",
  },
]))
write("fixtures/v1/dogfood-03-caption.run.json", {
  input: {},
  status: "completed",
  result: { caption: { text: "A small widget." } },
  steps: [{ nodeId: "Caption", status: "completed" }],
  events: ["run.start", "step.start", "step.end", "run.end"],
  note: "Ollama is not an MVP plugin. Phase 8 records a live caption or keeps this as a shape fixture.",
})

const packages = ["engine", "quickjs", "formatters", "local", "plugin-sdk", "host", "mcp-relay", "cli", "app"]
for (const name of packages) {
  const pkg = `@executioncontrolprotocol/${name}`
  write(`packages/${name}/package.json`, {
    name: pkg,
    version: "2.0.0",
    private: true,
    description: `ECP ${name} package. Scaffolded in Phase 0; behaviour lands in its phase.`,
    type: "module",
    engines: { node: ">=22.12" },
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    types: "./dist/index.d.ts",
    files: ["dist"],
    scripts: { build: "tsc -b" },
  })
  write(`packages/${name}/tsconfig.json`, {
    extends: "../../tsconfig.base.json",
    compilerOptions: { outDir: "dist", rootDir: "src" },
    include: ["src"],
  })
  write(`packages/${name}/src/index.ts`, `/**\n * Package version. The implementation arrives in a later phase.\n * @category Definitions\n */\nexport const VERSION = "2.0.0"\n`)
  write(`packages/${name}/test/smoke.test.ts`, `import { describe, expect, it } from "vitest"\nimport { VERSION } from "../src/index.js"\n\ndescribe("${name}", () => {\n  it("exports its version", () => {\n    expect(VERSION).toBe("2.0.0")\n  })\n})\n`)
}

const plugins = [
  ["plugin-test", "test"],
  ["plugin-anthropic", "anthropic"],
  ["plugin-azure-blob-storage", "azure-blob-storage"],
  ["plugin-adobe-firefly-services", "adobe-firefly-services"],
]
for (const [folder, short] of plugins) {
  write(`plugins/${folder}/package.json`, {
    name: `@executioncontrolprotocol/${folder}`,
    version: "2.0.0",
    private: true,
    description: `Scaffold for ${short}. The capability implementation arrives in Phase 8.`,
    type: "module",
    engines: { node: ">=22.12" },
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    types: "./dist/index.d.ts",
    files: ["dist"],
    scripts: { build: "tsc -b" },
    peerDependencies: {
      "@executioncontrolprotocol/plugin-sdk": "workspace:*",
      zod: "catalog:",
    },
    devDependencies: {
      "@executioncontrolprotocol/plugin-sdk": "workspace:*",
      zod: "catalog:",
    },
  })
  write(`plugins/${folder}/tsconfig.json`, {
    extends: "../../tsconfig.base.json",
    compilerOptions: { outDir: "dist", rootDir: "src" },
    include: ["src"],
  })
  write(`plugins/${folder}/src/index.ts`, `/**\n * Package version. Capabilities arrive in Phase 8.\n * @category Plugins\n */\nexport const VERSION = "2.0.0"\n`)
  write(`plugins/${folder}/test/smoke.test.ts`, `import { describe, expect, it } from "vitest"\nimport { VERSION } from "../src/index.js"\n\ndescribe("${folder}", () => {\n  it("exports its version", () => {\n    expect(VERSION).toBe("2.0.0")\n  })\n})\n`)
}

console.log("wrote fixtures and scaffolds")
