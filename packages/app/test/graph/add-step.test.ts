import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import type { ExecutionManifest, StepNode } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { addCapabilityStep, placementForConnectionOrigin } from "../../src/graph/add-step.js"
import { EXECUTION_ACCEPTS_NODE_ID } from "../../src/graph/io-from-schema.js"
import { LOOP_ITEM_HANDLE } from "../../src/graph/types.js"
import {
  STRUCTURE_EDIT_STEP_NOT_FOUND,
  STRUCTURE_EDIT_STRUCTURE_NOT_FOUND,
} from "../../src/graph/structure-edit.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const validDir = path.resolve(here, "../../../../fixtures/manifests/valid")
const schemaPath = path.resolve(
  here,
  "../../../../packages/protocol/schemas/execution.base.schema.json",
)

function load(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(validDir, name), "utf8")) as ExecutionManifest
}

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, "utf8")))

const echo = "@executioncontrolprotocol/test.echo"
const configEcho = "@executioncontrolprotocol/test.config-echo"

function stepShape(node: unknown): StepNode {
  expect(node).toMatchObject({ uses: expect.any(String), as: expect.any(String) })
  const step = node as StepNode
  expect(step.input).toBeUndefined()
  expect(step.type).toBeUndefined()
  return step
}

describe("addCapabilityStep", () => {
  it("appends at top level", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "seed", uses: echo, input: { value: "s" }, as: "seed" }],
    }
    const before = structuredClone(base)
    const result = addCapabilityStep(base, { id: echo }, { kind: "top" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(validate(result.manifest)).toBe(true)
    expect(before).toEqual(base)
    const added = result.manifest.steps.at(-1)
    stepShape(added)
    expect(added).toMatchObject({ id: "echo", uses: echo, as: "echo" })
  })

  it("inserts after top-level id", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "A", uses: echo, input: { value: "a" }, as: "A" },
        { id: "B", uses: echo, input: { value: "b" }, as: "B" },
      ],
    }
    const result = addCapabilityStep(base, { id: echo }, { kind: "top", after: "A" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.steps.map((node) => node.id)).toEqual(["A", "echo", "B"])
  })

  it("inserts after nested step's top-level ancestor", () => {
    const base = load("nested-branch.ecp.json")
    const result = addCapabilityStep(base, { id: echo }, { kind: "top", after: "x" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = result.manifest.steps.map((node) => node.id)
    expect(ids.indexOf("outer")).toBeLessThan(ids.indexOf("echo"))
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("echo"))
  })

  it("inserts at the start of the loop body with mode replace", () => {
    const base = load("loop.ecp.json")
    const result = addCapabilityStep(base, { id: echo }, { kind: "loop-body", loopId: "refine" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps.find((node) => node.id === "refine")
    expect(loop?.type).toBe("loop")
    if (loop?.type !== "loop") return
    const added = loop.steps[0]
    stepShape(added)
    expect(added).toMatchObject({ mode: "replace" })
  })

  it("does not set replace in forEach loop body", () => {
    const base = load("loop-foreach.ecp.json")
    const result = addCapabilityStep(base, { id: echo }, { kind: "loop-body", loopId: "rows" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps.find((node) => node.id === "rows")
    if (loop?.type !== "loop") return
    const added = loop.steps[0] as StepNode
    expect(added.mode).toBeUndefined()
  })

  it("adds to else side of an if", () => {
    const base = load("branch.ecp.json")
    const ifId = base.steps.find((node) => node.type === "if")?.id
    expect(ifId).toBeDefined()
    const result = addCapabilityStep(base, { id: echo }, { kind: "else-side", ifId: ifId! })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ifNode = result.manifest.steps[0]
    expect(ifNode.type).toBe("if")
    if (ifNode.type !== "if") return
    expect(ifNode.else?.some((step) => step.uses === echo)).toBe(true)
  })

  it("adds to then side of an if", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "b",
          expression: "true",
          then: [{ id: "keep", uses: echo, input: { value: "k" }, as: "keep" }],
        },
      ],
    }
    const result = addCapabilityStep(base, { id: echo }, { kind: "then-side", ifId: "b" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ifNode = result.manifest.steps[0]
    if (ifNode.type !== "if") return
    expect(ifNode.then).toHaveLength(2)
    expect(ifNode.then[1]).toMatchObject({ uses: echo })
  })

  it("adds parallel path", () => {
    const base = load("parallel.ecp.json")
    const result = addCapabilityStep(base, { id: echo }, { kind: "new-path", parallelId: "prepare" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parallel = result.manifest.steps[0]
    if (parallel.type !== "parallel") return
    expect(parallel.paths).toHaveLength(3)
    expect(parallel.paths[2]?.[0]).toMatchObject({ uses: echo })
  })

  it("resolves id collisions", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "echo", uses: echo, input: { value: "x" }, as: "out" }],
    }
    const result = addCapabilityStep(base, { id: echo }, { kind: "top" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const added = result.manifest.steps[1] as StepNode
    expect(added.id).toBe("echo-2")
    expect(added.as).toBe("echo")
  })

  it("resolves as collisions with another step as", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "other", uses: echo, input: { value: "x" }, as: "echo" }],
    }
    const result = addCapabilityStep(base, { id: echo }, { kind: "top" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const added = result.manifest.steps[1] as StepNode
    expect(added.id).toBe("echo")
    expect(added.as).toBe("echo2")
  })

  it("blocks as equal to accepts keys and loop fields", () => {
    const foreach = load("loop-foreach.ecp.json")
    const withEchoAs = addCapabilityStep(foreach, { id: echo }, { kind: "top" })
    expect(withEchoAs.ok).toBe(true)
    if (!withEchoAs.ok) return
    expect((withEchoAs.manifest.steps.at(-1) as StepNode).as).not.toBe("rowA")
    const loopBody = addCapabilityStep(foreach, { id: echo }, { kind: "loop-body", loopId: "rows" })
    expect(loopBody.ok).toBe(true)
    if (!loopBody.ok) return
    const loop = loopBody.manifest.steps.find((node) => node.id === "rows")
    if (loop?.type !== "loop") return
    const added = loop.steps[0] as StepNode
    expect(added.as).not.toBe("row")
    expect(added.as).not.toBe("results")
  })

  it("uses config-echo id stem and config_echo as", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "seed", uses: echo, input: { value: "s" }, as: "seed" }],
    }
    const result = addCapabilityStep(base, { id: configEcho }, { kind: "top" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.steps[1]).toMatchObject({ id: "config-echo", as: "config_echo", uses: configEcho })
  })

  it("rejects unknown after and detached-only after", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "only", uses: echo, input: { value: "x" }, as: "only" }],
    }
    expect(addCapabilityStep(base, { id: echo }, { kind: "top", after: "missing" })).toMatchObject({
      ok: false,
      reason: STRUCTURE_EDIT_STEP_NOT_FOUND,
    })
    const detached: ExecutionManifest = {
      ...base,
      steps: [{ id: "only", uses: echo, input: { value: "x" }, as: "only" }],
      detached: [{ id: "ghost", uses: echo, input: { value: "x" }, as: "ghost" }],
    }
    const before = structuredClone(detached)
    const bad = addCapabilityStep(detached, { id: echo }, { kind: "top", after: "ghost" })
    expect(bad).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND })
    expect(detached).toEqual(before)
  })

  it("rejects wrong structure kinds for placement", () => {
    const base = load("branch.ecp.json")
    expect(addCapabilityStep(base, { id: echo }, { kind: "loop-body", loopId: "pick" })).toMatchObject({
      ok: false,
      reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND,
    })
    expect(addCapabilityStep(base, { id: echo }, { kind: "then-side", ifId: "no" })).toMatchObject({
      ok: false,
      reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND,
    })
    const loop = load("loop.ecp.json")
    expect(addCapabilityStep(loop, { id: echo }, { kind: "new-path", parallelId: "refine" })).toMatchObject({
      ok: false,
      reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND,
    })
  })

  it("sets replace when adding to then side inside a while loop", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "retry",
          mode: "while",
          maxRounds: 2,
          steps: [
            {
              type: "if",
              id: "pick",
              expression: "true",
              then: [],
            },
          ],
          end: { input: { repeat: false } },
        },
      ],
    }
    const result = addCapabilityStep(base, { id: echo }, { kind: "then-side", ifId: "pick" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps[0]
    if (loop?.type !== "loop") return
    const inner = loop.steps[0]
    if (inner?.type !== "if") return
    const added = inner.then[0] as StepNode
    expect(added.mode).toBe("replace")
  })

  it("resolves combined id and as collisions", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "echo", uses: echo, input: { value: "a" }, as: "out" },
        { id: "other", uses: echo, input: { value: "b" }, as: "echo" },
      ],
    }
    const result = addCapabilityStep(base, { id: echo }, { kind: "top" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const added = result.manifest.steps[2] as StepNode
    expect(added.id).toBe("echo-2")
    expect(added.as).toBe("echo2")
  })

  it("sets replace on add path inside for loop", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "rounds",
          mode: "for",
          input: { count: { $ref: "state.count" } },
          steps: [
            {
              type: "parallel",
              id: "lanes",
              paths: [[{ id: "left", uses: echo, input: { value: "l" }, as: "left" }]],
            },
          ],
          end: { input: {} },
        },
      ],
    }
    const result = addCapabilityStep(base, { id: echo }, { kind: "new-path", parallelId: "lanes" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps[0]
    if (loop?.type !== "loop") return
    const parallel = loop.steps[0]
    if (parallel?.type !== "parallel") return
    const added = parallel.paths[1]?.[0] as StepNode
    expect(added.mode).toBe("replace")
  })

  it("rejects parallel placement on a step id", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "only", uses: echo, input: { value: "x" }, as: "only" }],
    }
    expect(addCapabilityStep(base, { id: echo }, { kind: "new-path", parallelId: "only" })).toMatchObject({
      ok: false,
      reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND,
    })
  })

  it("placementForConnectionOrigin maps drag origins", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "only", uses: echo, input: { value: "x" }, as: "only" }],
    }
    expect(
      placementForConnectionOrigin(base, {
        nodeId: EXECUTION_ACCEPTS_NODE_ID,
        handleId: "prompt",
        side: "output",
      }),
    ).toEqual({ kind: "before", nodeId: "only" })
    const looped: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "rows",
          mode: "forEach",
          as: "row",
          into: "out",
          ref: "state.items",
          steps: [{ id: "body", uses: echo, input: { value: "b" }, as: "body" }],
        },
      ],
    }
    expect(
      placementForConnectionOrigin(looped, { nodeId: "rows", handleId: LOOP_ITEM_HANDLE, side: "output" }),
    ).toEqual({ kind: "before", nodeId: "body" })
    expect(
      placementForConnectionOrigin(base, { nodeId: "only", handleId: "text", side: "output" }),
    ).toEqual({ kind: "after", nodeId: "only" })
  })

  it("inserts before and after in place", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "A", uses: echo, input: { value: "a" }, as: "A" },
        { id: "B", uses: echo, input: { value: "b" }, as: "B" },
      ],
    }
    const after = addCapabilityStep(base, { id: echo }, { kind: "after", nodeId: "A" })
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.manifest.steps.map((step) => step.id)).toEqual(["A", "echo", "B"])
    const before = addCapabilityStep(base, { id: echo }, { kind: "before", nodeId: "B" })
    expect(before.ok).toBe(true)
    if (!before.ok) return
    expect(before.manifest.steps.map((step) => step.id)).toEqual(["A", "echo", "B"])
  })

  it("inserts before and after inside a parallel line", () => {
    const base = load("parallel.ecp.json")
    const after = addCapabilityStep(base, { id: echo }, { kind: "after", nodeId: "left" })
    expect(after.ok).toBe(true)
    const before = addCapabilityStep(base, { id: echo }, { kind: "before", nodeId: "right" })
    expect(before.ok).toBe(true)
  })

  it("inserts before and after inside if then and else", () => {
    const base = load("branch.ecp.json")
    const afterThen = addCapabilityStep(base, { id: echo }, { kind: "after", nodeId: "yes" })
    expect(afterThen.ok).toBe(true)
    if (!afterThen.ok) return
    const gate = afterThen.manifest.steps[0]
    if (gate.type !== "if") return
    expect(gate.then.map((step) => step.id)).toContain("echo")
    const beforeElse = addCapabilityStep(base, { id: echo }, { kind: "before", nodeId: "no" })
    expect(beforeElse.ok).toBe(true)
    if (!beforeElse.ok) return
    const gate2 = beforeElse.manifest.steps[0]
    if (gate2.type !== "if") return
    expect(gate2.else?.map((step) => step.id)).toContain("echo")
  })

  it("rejects unknown before/after anchors", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "only", uses: echo, input: { value: "x" }, as: "only" }],
    }
    expect(addCapabilityStep(base, { id: echo }, { kind: "after", nodeId: "missing" })).toMatchObject({
      ok: false,
      reason: STRUCTURE_EDIT_STEP_NOT_FOUND,
    })
  })

  it("appends to detached loop body", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "seed", uses: echo, input: { value: "s" }, as: "seed" }],
      detached: [
        {
          type: "loop",
          id: "away",
          expr: "(state) => false",
          steps: [{ id: "tick", uses: echo, input: { value: "t" }, as: "tick", mode: "replace" }],
        },
      ],
    }
    const result = addCapabilityStep(base, { id: echo }, { kind: "loop-body", loopId: "away" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.detached?.[0]
    if (loop?.type !== "loop") return
    expect(loop.steps).toHaveLength(2)
    expect(loop.id).toBe("away")
  })
})
