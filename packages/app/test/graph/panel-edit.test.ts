import type { ExecutionManifest, IfNode, LoopNode, Node, ParallelNode, StepNode } from "@executioncontrolprotocol/protocol"
import { validateExecution } from "@executioncontrolprotocol/engine"
import { describe, expect, it } from "vitest"
import {
  addParallelPath,
  conditionForm,
  ensureLoopInto,
  ensureStructureAs,
  normalizeRefPath,
  parseLiteralInput,
  parseSchemaText,
  setEndAccepts,
  setEndGatherForm,
  setEndGatherText,
  setEndInputBinding,
  setEndReturns,
  setIfAccepts,
  setIfAs,
  setIfConditionForm,
  setIfConditionText,
  setIfInputBinding,
  setIfLabel,
  setLoopDriver,
  setLoopInto,
  setLoopLabel,
  setLoopMode,
  setParallelAccepts,
  setParallelAs,
  setParallelInputBinding,
  setParallelLabel,
  setParallelMaxConcurrency,
  setStructureLabel,
  PANEL_EDIT_CONDITION_FORM,
  PANEL_EDIT_INPUT_KEY,
  PANEL_EDIT_PATH_EMPTY,
  PANEL_EDIT_REF_PATH,
  PANEL_EDIT_REPEAT_WHILE_ONLY,
  PANEL_EDIT_SCHEMA_OBJECT,
  PANEL_EDIT_SCRIPT_FILE,
  PANEL_EDIT_STATE_KEY,
  PANEL_EDIT_WHILE_DRIVER,
  STRUCTURE_EDIT_STRUCTURE_NOT_FOUND,
  type LoopMode,
  type StructureEditResult,
} from "../../src/graph/index.js"
import { locateNode } from "../../src/graph/manifest-walk.js"

const echo = "@executioncontrolprotocol/test.echo"
const MISSING_PLUGIN = "ECP_PLUGINS_MISSING"

function step(id: string, value: unknown = "x"): Node {
  return { id, uses: echo, input: { value: value as never }, as: id }
}

function manifestOf(...steps: Node[]): ExecutionManifest {
  return { schema: "@executioncontrolprotocol.execution", version: "2.0", steps }
}

function ifManifest(extra: Partial<IfNode> = {}): ExecutionManifest {
  return manifestOf({ type: "if", id: "gate", expression: "true", then: [step("yes")], ...extra })
}

function parallelManifest(extra: Partial<ParallelNode> = {}): ExecutionManifest {
  return manifestOf({ type: "parallel", id: "fan", paths: [[step("a")], [step("b")]], ...extra })
}

function loopOf(mode: LoopMode): LoopNode {
  const body = [{ ...step("body", { $ref: "state.item" }), ...(mode === "forEach" ? {} : { mode: "replace" as const }) }]
  if (mode === "while") {
    return { type: "loop", id: "lp", mode, maxRounds: 3, steps: body, end: { input: { repeat: false } } }
  }
  if (mode === "for") {
    return { type: "loop", id: "lp", mode, as: "i", input: { count: 2 }, steps: body, end: { input: {} } }
  }
  return {
    type: "loop",
    id: "lp",
    mode,
    as: "item",
    into: "res",
    concurrency: 2,
    onError: "continue",
    input: { items: { $ref: "state.xs" } },
    steps: body,
    end: { input: { value: { $ref: "state.body" } } },
  }
}

function loopManifest(mode: LoopMode): ExecutionManifest {
  return manifestOf(loopOf(mode))
}

function ok(result: StructureEditResult): ExecutionManifest {
  if (!result.ok) throw new Error(`expected an edit, got: ${result.reason}`)
  return result.manifest
}

function refusal(result: StructureEditResult): string {
  if (result.ok) throw new Error("expected a refusal")
  return result.reason
}

function node<T extends Node>(manifest: ExecutionManifest, id: string): T {
  const hit = locateNode(manifest, id)
  if (!hit) throw new Error(`no node ${id}`)
  return hit.node as T
}

async function issueCodes(manifest: ExecutionManifest): Promise<Array<{ code: string; path: string }>> {
  const result = await validateExecution(manifest, { capabilities: [] })
  return result.issues
    .filter((issue) => issue.code !== MISSING_PLUGIN)
    .map((issue) => ({ code: issue.code, path: issue.path }))
}

describe("parsing helpers", () => {
  it("normalizeRefPath accepts names and state paths and refuses the rest", () => {
    expect(normalizeRefPath("rows")).toBe("state.rows")
    expect(normalizeRefPath("state.rows")).toBe("state.rows")
    expect(normalizeRefPath("  state.rows.items.0  ")).toBe("state.rows.items.0")
    expect(normalizeRefPath("")).toBeUndefined()
    expect(normalizeRefPath("state.")).toBeUndefined()
    expect(normalizeRefPath("state.a b")).toBeUndefined()
    expect(normalizeRefPath("1abc")).toBeUndefined()
  })

  it("parseLiteralInput parses JSON and keeps other text as a string", () => {
    expect(parseLiteralInput("3")).toBe(3)
    expect(parseLiteralInput("true")).toBe(true)
    expect(parseLiteralInput('["a"]')).toEqual(["a"])
    expect(parseLiteralInput("hello")).toBe("hello")
    expect(parseLiteralInput("")).toBe("")
  })

  it("parseSchemaText removes on empty text and requires a JSON object", () => {
    expect(parseSchemaText("")).toEqual({ ok: true, schema: undefined })
    expect(parseSchemaText("   ")).toEqual({ ok: true, schema: undefined })
    expect(parseSchemaText('{"type":"object"}')).toEqual({ ok: true, schema: { type: "object" } })
    expect(parseSchemaText("[1]")).toEqual({ ok: false, reason: PANEL_EDIT_SCHEMA_OBJECT })
    expect(parseSchemaText("{oops")).toMatchObject({ ok: false })
  })

  it("conditionForm reads the form a holder is written in", () => {
    expect(conditionForm({})).toBe("none")
    expect(conditionForm({ expression: "true" })).toBe("expression")
    expect(conditionForm({ script: { lang: "js", source: "return 1" } })).toBe("script")
  })
})

describe("if edits", () => {
  it("sets and clears the label", () => {
    const labelled = ok(setIfLabel(ifManifest(), "gate", "Check it"))
    expect(node<IfNode>(labelled, "gate").label).toBe("Check it")
    expect(node<IfNode>(ok(setIfLabel(labelled, "gate", "  ")), "gate").label).toBeUndefined()
    expect(node<IfNode>(ok(setIfLabel(labelled, "gate", undefined)), "gate").label).toBeUndefined()
  })

  it("refuses an unknown id and a node of another kind", () => {
    expect(refusal(setIfLabel(ifManifest(), "missing", "x"))).toBe(STRUCTURE_EDIT_STRUCTURE_NOT_FOUND)
    expect(refusal(setIfLabel(ifManifest(), "yes", "x"))).toBe(STRUCTURE_EDIT_STRUCTURE_NOT_FOUND)
    expect(refusal(setIfLabel(parallelManifest(), "fan", "x"))).toBe(STRUCTURE_EDIT_STRUCTURE_NOT_FOUND)
  })

  it("does not change the manifest it is given", () => {
    const base = ifManifest()
    const before = JSON.stringify(base)
    ok(setIfLabel(base, "gate", "changed"))
    ok(setIfConditionForm(base, "gate", "script"))
    expect(JSON.stringify(base)).toBe(before)
  })

  it("edits a detached if", () => {
    const base: ExecutionManifest = {
      ...manifestOf(step("keep")),
      detached: [{ type: "if", id: "loose", expression: "true", then: [step("t")] }],
    }
    expect(node<IfNode>(ok(setIfLabel(base, "loose", "Loose")), "loose").label).toBe("Loose")
  })

  it("sets accepts, removes it, and refuses a non-object schema", () => {
    const schema = { type: "object", properties: { mode: { type: "string" } }, required: ["mode"] }
    const withSchema = ok(setIfAccepts(ifManifest(), "gate", schema))
    expect(node<IfNode>(withSchema, "gate").accepts).toEqual(schema)
    expect(node<IfNode>(ok(setIfAccepts(withSchema, "gate", undefined)), "gate").accepts).toBeUndefined()
    expect(refusal(setIfAccepts(ifManifest(), "gate", [] as never))).toBe(PANEL_EDIT_SCHEMA_OBJECT)
  })

  it("switches the condition from expression to script and back without losing it", () => {
    const base = ifManifest({ expression: "input.mode === 'full'" })
    const scripted = ok(setIfConditionForm(base, "gate", "script"))
    const gate = node<IfNode>(scripted, "gate")
    expect(gate.expression).toBeUndefined()
    expect(gate.script).toEqual({ lang: "js", source: "return input.mode === 'full'" })
    expect(conditionForm(gate)).toBe("script")

    const back = ok(setIfConditionForm(scripted, "gate", "expression"))
    const restored = node<IfNode>(back, "gate")
    expect(restored.script).toBeUndefined()
    expect(restored.expression).toBe("input.mode === 'full'")
  })

  it("switching to the form it already has changes nothing", () => {
    const base = ifManifest({ expression: "input.n > 1" })
    expect(node<IfNode>(ok(setIfConditionForm(base, "gate", "expression")), "gate").expression).toBe("input.n > 1")
    const scripted = ok(setIfConditionForm(base, "gate", "script"))
    expect(node<IfNode>(ok(setIfConditionForm(scripted, "gate", "script")), "gate").script?.source).toBe(
      "return input.n > 1",
    )
  })

  it("falls back to the default expression when a script is not a single return", () => {
    const base = ifManifest()
    const scripted = ok(setIfConditionText(ok(setIfConditionForm(base, "gate", "script")), "gate", "const a = 1; return a"))
    const back = node<IfNode>(ok(setIfConditionForm(scripted, "gate", "expression")), "gate")
    expect(back.expression).toBe("true")
    expect(back.script).toBeUndefined()
  })

  it("keeps a single return statement as an expression, with or without a trailing semicolon", () => {
    const withSemicolon = ifManifest({
      expression: undefined,
      script: { lang: "js", source: "return input.ok;" },
    })
    expect(node<IfNode>(ok(setIfConditionForm(withSemicolon, "gate", "expression")), "gate").expression).toBe("input.ok")
  })

  it("sets the text of the current form", () => {
    const expression = ok(setIfConditionText(ifManifest(), "gate", "input.a > 2"))
    expect(node<IfNode>(expression, "gate").expression).toBe("input.a > 2")
    const scripted = ok(setIfConditionForm(ifManifest(), "gate", "script"))
    const edited = ok(setIfConditionText(scripted, "gate", "return input.b"))
    expect(node<IfNode>(edited, "gate").script).toEqual({ lang: "js", source: "return input.b" })
    expect(node<IfNode>(edited, "gate").expression).toBeUndefined()
  })

  it("refuses to edit the text of a script kept in a file", () => {
    const base = ifManifest({ expression: undefined, script: { lang: "js", path: "./cond.js" } })
    expect(refusal(setIfConditionText(base, "gate", "return 1"))).toBe(PANEL_EDIT_SCRIPT_FILE)
  })

  it("refuses text for a condition that has neither form", () => {
    const base = ifManifest({ expression: undefined })
    expect(refusal(setIfConditionText(base, "gate", "true"))).toBe(PANEL_EDIT_CONDITION_FORM)
  })

  it("sets as (adding an empty input), clears it, and refuses a bad name", () => {
    const aliased = ok(setIfAs(ifManifest(), "gate", "verdict"))
    expect(node<IfNode>(aliased, "gate").as).toBe("verdict")
    expect(node<IfNode>(aliased, "gate").input).toEqual({})
    expect(node<IfNode>(ok(setIfAs(aliased, "gate", "")), "gate").as).toBeUndefined()
    expect(node<IfNode>(ok(setIfAs(aliased, "gate", undefined)), "gate").as).toBeUndefined()
    expect(refusal(setIfAs(ifManifest(), "gate", "1bad"))).toBe(PANEL_EDIT_STATE_KEY)
    expect(refusal(setIfAs(ifManifest(), "gate", "has space"))).toBe(PANEL_EDIT_STATE_KEY)
  })

  it("binds an input to a literal, a reference, and removes it", () => {
    const literal = ok(setIfInputBinding(ifManifest(), "gate", "mode", { kind: "literal", value: "full" }))
    expect(node<IfNode>(literal, "gate").input).toEqual({ mode: "full" })
    const bound = ok(setIfInputBinding(literal, "gate", "mode", { kind: "ref", path: "state.mode" }))
    expect(node<IfNode>(bound, "gate").input).toEqual({ mode: { $ref: "state.mode" } })
    const shorthand = ok(setIfInputBinding(literal, "gate", "mode", { kind: "ref", path: "mode" }))
    expect(node<IfNode>(shorthand, "gate").input).toEqual({ mode: { $ref: "state.mode" } })
    const removed = ok(setIfInputBinding(bound, "gate", "mode", { kind: "unset" }))
    expect(node<IfNode>(removed, "gate").input).toEqual({})
  })

  it("keeps the other inputs when one changes", () => {
    const two = ok(
      setIfInputBinding(
        ok(setIfInputBinding(ifManifest(), "gate", "a", { kind: "literal", value: 1 })),
        "gate",
        "b",
        { kind: "literal", value: 2 },
      ),
    )
    const changed = ok(setIfInputBinding(two, "gate", "a", { kind: "literal", value: 9 }))
    expect(node<IfNode>(changed, "gate").input).toEqual({ a: 9, b: 2 })
  })

  it("refuses an empty key, a marker key and a bad reference", () => {
    expect(refusal(setIfInputBinding(ifManifest(), "gate", " ", { kind: "literal", value: 1 }))).toBe(PANEL_EDIT_INPUT_KEY)
    expect(refusal(setIfInputBinding(ifManifest(), "gate", "$ref", { kind: "literal", value: 1 }))).toBe(PANEL_EDIT_INPUT_KEY)
    expect(refusal(setIfInputBinding(ifManifest(), "gate", "a", { kind: "ref", path: "not a path" }))).toBe(
      PANEL_EDIT_REF_PATH,
    )
  })

  it("unsetting a key of an if with no input is a no-op", () => {
    expect(ok(setIfInputBinding(ifManifest(), "gate", "a", { kind: "unset" })).steps).toEqual(ifManifest().steps)
  })

  it("an if edited through the panel still validates", async () => {
    let manifest = ifManifest({ expression: undefined, script: { lang: "js", source: "return input.go" } })
    manifest = ok(setIfAccepts(manifest, "gate", { type: "object", properties: { go: { type: "boolean" } } }))
    manifest = ok(setIfInputBinding(manifest, "gate", "go", { kind: "literal", value: true }))
    manifest = ok(setIfAs(manifest, "gate", "decision"))
    expect(await issueCodes(manifest)).toEqual([])
  })
})

describe("parallel edits", () => {
  it("sets the label and clears it", () => {
    const labelled = ok(setParallelLabel(parallelManifest(), "fan", "Fan out"))
    expect(node<ParallelNode>(labelled, "fan").label).toBe("Fan out")
    expect(node<ParallelNode>(ok(setParallelLabel(labelled, "fan", "")), "fan").label).toBeUndefined()
    expect(refusal(setParallelLabel(parallelManifest(), "gate", "x"))).toBe(STRUCTURE_EDIT_STRUCTURE_NOT_FOUND)
  })

  it("sets and removes accepts", () => {
    const schema = { type: "object", properties: { n: { type: "integer" } } }
    const withSchema = ok(setParallelAccepts(parallelManifest(), "fan", schema))
    expect(node<ParallelNode>(withSchema, "fan").accepts).toEqual(schema)
    expect(node<ParallelNode>(ok(setParallelAccepts(withSchema, "fan", undefined)), "fan").accepts).toBeUndefined()
  })

  it("sets as with an empty input, and removes it", () => {
    const aliased = ok(setParallelAs(parallelManifest(), "fan", "work"))
    expect(node<ParallelNode>(aliased, "fan").as).toBe("work")
    expect(node<ParallelNode>(aliased, "fan").input).toEqual({})
    expect(node<ParallelNode>(ok(setParallelAs(aliased, "fan", undefined)), "fan").as).toBeUndefined()
    expect(refusal(setParallelAs(parallelManifest(), "fan", "9x"))).toBe(PANEL_EDIT_STATE_KEY)
  })

  it("binds inputs", () => {
    const bound = ok(setParallelInputBinding(parallelManifest(), "fan", "doc", { kind: "ref", path: "state.doc" }))
    expect(node<ParallelNode>(bound, "fan").input).toEqual({ doc: { $ref: "state.doc" } })
    expect(refusal(setParallelInputBinding(parallelManifest(), "fan", "", { kind: "unset" }))).toBe(PANEL_EDIT_INPUT_KEY)
  })

  it("sets maxConcurrency, clears it, and refuses zero, negatives and fractions", () => {
    const limited = ok(setParallelMaxConcurrency(parallelManifest(), "fan", 2))
    expect(node<ParallelNode>(limited, "fan").maxConcurrency).toBe(2)
    expect(node<ParallelNode>(ok(setParallelMaxConcurrency(limited, "fan", undefined)), "fan").maxConcurrency).toBeUndefined()
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(refusal(setParallelMaxConcurrency(parallelManifest(), "fan", bad))).toMatch(/whole number/)
    }
  })

  it("adds a path at the end, with its own copy of the nodes", () => {
    const nodes = [step("c")]
    const added = ok(addParallelPath(parallelManifest(), "fan", nodes))
    const fan = node<ParallelNode>(added, "fan")
    expect(fan.paths).toHaveLength(3)
    expect(fan.paths[2]).toEqual(nodes)
    expect(fan.paths[2]).not.toBe(nodes)
  })

  it("refuses an empty path", () => {
    expect(refusal(addParallelPath(parallelManifest(), "fan", []))).toBe(PANEL_EDIT_PATH_EMPTY)
  })

  it("a parallel edited through the panel still validates", async () => {
    let manifest = parallelManifest()
    manifest = ok(setParallelMaxConcurrency(manifest, "fan", 1))
    manifest = ok(setParallelAs(manifest, "fan", "work"))
    manifest = ok(addParallelPath(manifest, "fan", [step("c")]))
    expect(await issueCodes(manifest)).toEqual([])
  })
})

describe("structure label", () => {
  it("sets and clears the label of an if, parallel and loop", () => {
    for (const [manifest, id] of [
      [ifManifest(), "gate"],
      [parallelManifest(), "fan"],
      [loopManifest("while"), "lp"],
    ] as const) {
      const labelled = ok(setStructureLabel(manifest, id, "Named"))
      expect((node(labelled, id) as { label?: string }).label).toBe("Named")
      expect((node(ok(setStructureLabel(labelled, id, undefined)), id) as { label?: string }).label).toBeUndefined()
    }
    expect(refusal(setStructureLabel(ifManifest(), "yes", "x"))).toBe(STRUCTURE_EDIT_STRUCTURE_NOT_FOUND)
  })
})

describe("loop edits", () => {
  it("sets the label", () => {
    const labelled = ok(setLoopLabel(loopManifest("for"), "lp", "Repeat"))
    expect(node<LoopNode>(labelled, "lp").label).toBe("Repeat")
    expect(node<LoopNode>(ok(setLoopLabel(labelled, "lp", "")), "lp").label).toBeUndefined()
  })

  it("binds the forEach driver to items and the for driver to count", () => {
    const items = ok(setLoopDriver(loopManifest("forEach"), "lp", { kind: "ref", path: "state.rows" }))
    expect(node<LoopNode>(items, "lp").input).toEqual({ items: { $ref: "state.rows" } })
    const count = ok(setLoopDriver(loopManifest("for"), "lp", { kind: "literal", value: 5 }))
    expect(node<LoopNode>(count, "lp").input).toEqual({ count: 5 })
    const bound = ok(setLoopDriver(loopManifest("for"), "lp", { kind: "ref", path: "state.n" }))
    expect(node<LoopNode>(bound, "lp").input).toEqual({ count: { $ref: "state.n" } })
  })

  it("removes the driver but keeps the input object the mode requires", () => {
    const cleared = ok(setLoopDriver(loopManifest("forEach"), "lp", { kind: "unset" }))
    expect(node<LoopNode>(cleared, "lp").input).toEqual({})
  })

  it("refuses a driver on a while loop and a bad reference", () => {
    expect(refusal(setLoopDriver(loopManifest("while"), "lp", { kind: "literal", value: 1 }))).toBe(PANEL_EDIT_WHILE_DRIVER)
    expect(refusal(setLoopDriver(loopManifest("forEach"), "lp", { kind: "ref", path: "??" }))).toBe(PANEL_EDIT_REF_PATH)
    expect(refusal(setLoopDriver(ifManifest(), "gate", { kind: "unset" }))).toBe(STRUCTURE_EDIT_STRUCTURE_NOT_FOUND)
  })

  it("sets and clears into, and refuses a bad name", () => {
    const named = ok(setLoopInto(loopManifest("for"), "lp", "out"))
    expect(node<LoopNode>(named, "lp").into).toBe("out")
    expect(node<LoopNode>(ok(setLoopInto(named, "lp", "")), "lp").into).toBeUndefined()
    expect(node<LoopNode>(ok(setLoopInto(named, "lp", undefined)), "lp").into).toBeUndefined()
    expect(refusal(setLoopInto(loopManifest("for"), "lp", "bad name"))).toBe(PANEL_EDIT_STATE_KEY)
    expect(refusal(setLoopInto(ifManifest(), "gate", "out"))).toBe(STRUCTURE_EDIT_STRUCTURE_NOT_FOUND)
  })

  it("ensureLoopInto and ensureStructureAs allocate a free name from the id, once", () => {
    const manifest = manifestOf({ ...loopOf("for"), id: "my-loop" }, { type: "if", id: "my-if", expression: "true", then: [step("t")] })
    const draft = structuredClone(manifest)
    const loop = node<LoopNode>(draft, "my-loop")
    expect(ensureLoopInto(draft, loop)).toBe("my_loop")
    expect(ensureLoopInto(draft, loop)).toBe("my_loop")
    const gate = node<IfNode>(draft, "my-if")
    expect(ensureStructureAs(draft, gate)).toBe("my_if")
    expect(gate.input).toEqual({})
    expect(ensureStructureAs(draft, gate)).toBe("my_if")
  })

  it("ensureStructureAs picks another name when the id name is taken", () => {
    const draft = manifestOf(step("g"), { type: "if", id: "g_", expression: "true", then: [step("t")] })
    const gate = node<IfNode>(draft, "g_")
    expect(ensureStructureAs(draft, gate)).not.toBe("g")
  })
})

describe("loop mode changes", () => {
  const modes: LoopMode[] = ["while", "for", "forEach"]
  const pairs = modes.flatMap((from) => modes.filter((to) => to !== from).map((to) => [from, to] as const))

  it.each(pairs)("%s to %s rewrites the fields and leaves what the engine allows", async (from, to) => {
    const changed = ok(setLoopMode(loopManifest(from), "lp", to))
    const loop = node<LoopNode>(changed, "lp")
    expect(loop.mode).toBe(to)
    if (to === "while") {
      expect(loop.maxRounds).toBeGreaterThanOrEqual(1)
      expect(loop.as).toBeUndefined()
      expect(loop.input).toBeUndefined()
      expect(loop.concurrency).toBeUndefined()
      expect(loop.onError).toBeUndefined()
      expect(loop.end?.input?.repeat).toBe(false)
    } else {
      expect(loop.maxRounds).toBeUndefined()
      expect(loop.end?.input?.repeat).toBeUndefined()
      expect(loop.as).toBeTruthy()
    }
    if (to === "for") {
      expect(loop.input?.count).toBeDefined()
      expect(loop.input?.items).toBeUndefined()
      expect(loop.concurrency).toBeUndefined()
      expect(loop.onError).toBeUndefined()
    }
    if (to !== "while") expect(loop.input).toBeDefined()
    if (to === "forEach") {
      expect(loop.input?.count).toBeUndefined()
      expect(loop.into).toBeTruthy()
    }
    const issues = await issueCodes(changed)
    if (to === "forEach" && from !== "forEach") {
      // The driver is not invented: validation reports the unbound items (and the value `into` needs).
      expect(issues.every((issue) => /\/input\/items$|\/end\/input\/value$/.test(issue.path))).toBe(true)
    } else {
      expect(issues).toEqual([])
    }
  })

  it("sets replace on body steps that commit with the default mode when a loop becomes while or for", () => {
    const base = manifestOf({
      ...loopOf("forEach"),
      steps: [
        step("plain"),
        { ...step("appended"), mode: "append" },
        { id: "quiet", uses: echo, input: { value: "q" } },
        {
          type: "if",
          id: "inner",
          expression: "true",
          then: [{ ...step("nested"), mode: "create" }],
        },
      ],
    })
    const changed = ok(setLoopMode(base, "lp", "while"))
    expect(node<StepNode>(changed, "plain").mode).toBe("replace")
    expect(node<StepNode>(changed, "appended").mode).toBe("append")
    expect(node<StepNode>(changed, "quiet").mode).toBeUndefined()
    expect(node<StepNode>(changed, "nested").mode).toBe("replace")
    const stayed = ok(setLoopMode(base, "lp", "forEach"))
    expect(node<StepNode>(stayed, "plain").mode).toBeUndefined()
  })

  it("keeps the as and into a loop already has, and the count it already has", () => {
    const forEach = ok(setLoopMode(loopManifest("forEach"), "lp", "for"))
    expect(node<LoopNode>(forEach, "lp").as).toBe("item")
    const withCount = manifestOf({ ...loopOf("for"), input: { count: 7 } })
    const toWhileAndBack = ok(setLoopMode(ok(setLoopMode(withCount, "lp", "while")), "lp", "for"))
    expect(node<LoopNode>(toWhileAndBack, "lp").input).toEqual({ count: 1 })
    const forEachAgain = ok(setLoopMode(loopManifest("forEach"), "lp", "forEach"))
    expect(node<LoopNode>(forEachAgain, "lp").into).toBe("res")
    expect(node<LoopNode>(forEachAgain, "lp").input).toEqual({ items: { $ref: "state.xs" } })
  })

  it("keeps maxRounds and repeat when a while loop is switched to while", () => {
    const same = ok(setLoopMode(loopManifest("while"), "lp", "while"))
    expect(node<LoopNode>(same, "lp").maxRounds).toBe(3)
    expect(node<LoopNode>(same, "lp").end?.input?.repeat).toBe(false)
  })

  it("keeps a repeat binding when a while loop stays a while loop", () => {
    const base = manifestOf({ ...loopOf("while"), end: { input: { repeat: { $ref: "state.again" } } } })
    const same = ok(setLoopMode(base, "lp", "while"))
    expect(node<LoopNode>(same, "lp").end?.input?.repeat).toEqual({ $ref: "state.again" })
  })

  it("picks a free name for the placeholder as and into", () => {
    const base = manifestOf(
      { ...step("item"), as: "item" },
      { ...step("results"), as: "results" },
      { ...loopOf("while"), id: "lp" },
    )
    const forEach = node<LoopNode>(ok(setLoopMode(base, "lp", "forEach")), "lp")
    expect(forEach.as).not.toBe("item")
    expect(forEach.into).not.toBe("results")
    expect(forEach.as).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/)
    expect(forEach.into).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/)
  })

  it("leaves the end gather alone", () => {
    const base = manifestOf({
      ...loopOf("forEach"),
      end: { input: { value: { $ref: "state.body" } }, expression: "input.value", returns: { type: "string" } },
    })
    const end = node<LoopNode>(ok(setLoopMode(base, "lp", "for")), "lp").end
    expect(end?.expression).toBe("input.value")
    expect(end?.returns).toEqual({ type: "string" })
    expect(end?.input?.value).toEqual({ $ref: "state.body" })
  })

  it("refuses an unknown mode, an unknown id and a node of another kind", () => {
    expect(refusal(setLoopMode(loopManifest("for"), "lp", "until" as never))).toBe("Invalid loop field")
    expect(refusal(setLoopMode(loopManifest("for"), "nope", "while"))).toBe(STRUCTURE_EDIT_STRUCTURE_NOT_FOUND)
    expect(refusal(setLoopMode(ifManifest(), "gate", "while"))).toBe(STRUCTURE_EDIT_STRUCTURE_NOT_FOUND)
  })

  it("does not change the manifest it is given", () => {
    const base = loopManifest("forEach")
    const before = JSON.stringify(base)
    ok(setLoopMode(base, "lp", "while"))
    expect(JSON.stringify(base)).toBe(before)
  })
})

describe("end edits", () => {
  it("sets and removes accepts and returns", () => {
    const accepts = { type: "object", properties: { value: { type: "string" } } }
    const withAccepts = ok(setEndAccepts(loopManifest("for"), "lp", accepts))
    expect(node<LoopNode>(withAccepts, "lp").end?.accepts).toEqual(accepts)
    expect(node<LoopNode>(ok(setEndAccepts(withAccepts, "lp", undefined)), "lp").end?.accepts).toBeUndefined()
    const returns = { type: "string" }
    const withReturns = ok(setEndReturns(loopManifest("for"), "lp", returns))
    expect(node<LoopNode>(withReturns, "lp").end?.returns).toEqual(returns)
    expect(node<LoopNode>(ok(setEndReturns(withReturns, "lp", undefined)), "lp").end?.returns).toBeUndefined()
    expect(refusal(setEndAccepts(loopManifest("for"), "lp", [] as never))).toBe(PANEL_EDIT_SCHEMA_OBJECT)
    expect(refusal(setEndReturns(loopManifest("for"), "lp", [] as never))).toBe(PANEL_EDIT_SCHEMA_OBJECT)
  })

  it("creates the end when a loop has none", () => {
    const bare = manifestOf({ ...loopOf("for"), end: undefined })
    const edited = ok(setEndReturns(bare, "lp", { type: "number" }))
    expect(node<LoopNode>(edited, "lp").end?.returns).toEqual({ type: "number" })
    expect(node<LoopNode>(edited, "lp").end?.input).toEqual({})
  })

  it("gathers as none, expression and script, carrying the text over", () => {
    const base = loopManifest("forEach")
    expect(conditionForm(node<LoopNode>(base, "lp").end ?? {})).toBe("none")
    const expression = ok(setEndGatherForm(base, "lp", "expression"))
    expect(node<LoopNode>(expression, "lp").end?.expression).toBe("input.value")
    const edited = ok(setEndGatherText(expression, "lp", "input.value.toUpperCase()"))
    expect(node<LoopNode>(edited, "lp").end?.expression).toBe("input.value.toUpperCase()")
    const script = ok(setEndGatherForm(edited, "lp", "script"))
    expect(node<LoopNode>(script, "lp").end?.script).toEqual({ lang: "js", source: "return input.value.toUpperCase()" })
    expect(node<LoopNode>(script, "lp").end?.expression).toBeUndefined()
    const scriptEdited = ok(setEndGatherText(script, "lp", "return 1"))
    expect(node<LoopNode>(scriptEdited, "lp").end?.script?.source).toBe("return 1")
    const none = ok(setEndGatherForm(scriptEdited, "lp", "none"))
    expect(node<LoopNode>(none, "lp").end?.script).toBeUndefined()
    expect(node<LoopNode>(none, "lp").end?.expression).toBeUndefined()
  })

  it("refuses gather text when there is no gather, or the script is a file", () => {
    expect(refusal(setEndGatherText(loopManifest("forEach"), "lp", "input.value"))).toBe(PANEL_EDIT_CONDITION_FORM)
    const filed = manifestOf({ ...loopOf("forEach"), end: { input: {}, script: { lang: "js", path: "./g.js" } } })
    expect(refusal(setEndGatherText(filed, "lp", "return 1"))).toBe(PANEL_EDIT_SCRIPT_FILE)
  })

  it("binds value, repeat and an accepts key", () => {
    const value = ok(setEndInputBinding(loopManifest("for"), "lp", "value", { kind: "ref", path: "state.body" }))
    expect(node<LoopNode>(value, "lp").end?.input?.value).toEqual({ $ref: "state.body" })
    const repeat = ok(setEndInputBinding(loopManifest("while"), "lp", "repeat", { kind: "ref", path: "state.again" }))
    expect(node<LoopNode>(repeat, "lp").end?.input?.repeat).toEqual({ $ref: "state.again" })
    const extra = ok(setEndInputBinding(loopManifest("for"), "lp", "score", { kind: "literal", value: 3 }))
    expect(node<LoopNode>(extra, "lp").end?.input?.score).toBe(3)
    const removed = ok(setEndInputBinding(value, "lp", "value", { kind: "unset" }))
    expect(node<LoopNode>(removed, "lp").end?.input?.value).toBeUndefined()
  })

  it("refuses repeat outside a while loop, but lets it be removed", () => {
    for (const mode of ["for", "forEach"] as const) {
      expect(refusal(setEndInputBinding(loopManifest(mode), "lp", "repeat", { kind: "literal", value: false }))).toBe(
        PANEL_EDIT_REPEAT_WHILE_ONLY,
      )
    }
    const stray = manifestOf({ ...loopOf("for"), end: { input: { repeat: false } } })
    const removed = ok(setEndInputBinding(stray, "lp", "repeat", { kind: "unset" }))
    expect(node<LoopNode>(removed, "lp").end?.input?.repeat).toBeUndefined()
  })

  it("refuses a bad key or reference, and a node that is not a loop", () => {
    expect(refusal(setEndInputBinding(loopManifest("for"), "lp", "", { kind: "unset" }))).toBe(PANEL_EDIT_INPUT_KEY)
    expect(refusal(setEndInputBinding(loopManifest("for"), "lp", "value", { kind: "ref", path: "?" }))).toBe(PANEL_EDIT_REF_PATH)
    expect(refusal(setEndInputBinding(ifManifest(), "gate", "value", { kind: "unset" }))).toBe(STRUCTURE_EDIT_STRUCTURE_NOT_FOUND)
  })

  it("an end gathered by script still validates", async () => {
    let manifest = loopManifest("forEach")
    manifest = ok(setEndGatherForm(manifest, "lp", "script"))
    manifest = ok(setEndGatherText(manifest, "lp", "return input.value"))
    manifest = ok(setEndReturns(manifest, "lp", { type: "object", properties: { text: { type: "string" } } }))
    expect(await issueCodes(manifest)).toEqual([])
  })
})
