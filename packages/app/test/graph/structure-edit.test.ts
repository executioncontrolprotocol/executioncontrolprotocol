import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { validateExecution } from "@executioncontrolprotocol/engine"
import { describe, expect, it } from "vitest"
import {
  STRUCTURE_EDIT_CONTIGUOUS,
  STRUCTURE_EDIT_EMPTY_STEPS,
  STRUCTURE_EDIT_PARALLEL_MIN,
  STRUCTURE_EDIT_STEP_NOT_FOUND,
  addControlNode,
  deleteStep,
  removeStructure,
  setLoopField,
  unwrapStructure,
  wrapSelectionIds,
  wrapSteps,
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

function flatTwoStep(): ExecutionManifest {
  return {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      { id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" },
      { id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" },
    ],
  }
}

describe("structure-edit", () => {
  it("rejects wrap with no step ids", () => {
    expect(wrapSteps(flatTwoStep(), [], "if")).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND })
  })

  it("wrapSelectionIds prefers the multi-selection", () => {
    expect(wrapSelectionIds(["A", "B"], "A")).toEqual(["A", "B"])
    expect(wrapSelectionIds(["A", "B"], "C")).toEqual(["C"])
  })

  it("wrapSteps if and round-trips", () => {
    const base = flatTwoStep()
    const wrapped = wrapSteps(base, ["A", "B"], "if")
    expect(wrapped.ok).toBe(true)
    if (!wrapped.ok) return
    expect(validate(wrapped.manifest)).toBe(true)
    const id = wrapped.manifest.steps[0]!.id
    const back = unwrapStructure(wrapped.manifest, id)
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.manifest).toEqual(base)
  })

  it("wrapSteps parallel requires two steps", () => {
    const base = flatTwoStep()
    expect(wrapSteps(base, ["A"], "parallel")).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_PARALLEL_MIN })
    const wrapped = wrapSteps(base, ["A", "B"], "parallel")
    expect(wrapped.ok).toBe(true)
    if (wrapped.ok) {
      expect(validate(wrapped.manifest)).toBe(true)
      const back = unwrapStructure(wrapped.manifest, wrapped.manifest.steps[0]!.id)
      expect(back.ok && back.manifest).toEqual(base)
    }
  })

  it("rejects non-contiguous and cross-line wraps", () => {
    const parallel = load("parallel.ecp.json")
    expect(wrapSteps(parallel, ["left", "right"], "if")).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_CONTIGUOUS })
    const three: ExecutionManifest = {
      ...flatTwoStep(),
      steps: [
        ...flatTwoStep().steps,
        { id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" },
      ],
    }
    expect(wrapSteps(three, ["A", "C"], "loop")).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_CONTIGUOUS })
  })

  it("skips ids that collide with detached steps", () => {
    const manifest = {
      ...flatTwoStep(),
      detached: [
        { id: "if-1", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "if-1" },
      ],
    } as ExecutionManifest
    const wrapped = wrapSteps(manifest, ["A"], "if")
    expect(wrapped.ok).toBe(true)
    if (wrapped.ok) expect(wrapped.manifest.steps[0]!.id).toBe("if-2")
  })

  it("allocates if-2 when if-1 exists", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "if-1",
          expression: "true",
          then: [{ id: "x", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }],
        },
        { id: "wrap-me", uses: "@executioncontrolprotocol/test.echo", input: { value: "y" }, as: "wrap-me" },
      ],
    }
    const wrapped = wrapSteps(manifest, ["wrap-me"], "if")
    expect(wrapped.ok).toBe(true)
    if (wrapped.ok) expect(wrapped.manifest.steps.some((node) => node.id === "if-2")).toBe(true)
  })

  it("deleteStep leaves parallel with an empty path when one arm is cleared", () => {
    const base = flatTwoStep()
    const wrapped = wrapSteps(base, ["A", "B"], "parallel")
    if (!wrapped.ok) throw new Error("wrap failed")
    const deleted = deleteStep(wrapped.manifest, "A")
    expect(deleted.ok).toBe(true)
    if (deleted.ok) {
      const parallel = deleted.manifest.steps[0]
      expect(parallel?.type).toBe("parallel")
      if (parallel?.type === "parallel") {
        const ids = parallel.paths.flatMap((path) => path.map((node) => node.id))
        expect(ids).toContain("B")
        expect(parallel.paths.some((path) => path.length === 0)).toBe(true)
      }
    }
  })

  it("refuses to empty top-level steps", () => {
    const only: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "only", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "only" }],
    }
    expect(deleteStep(only, "only")).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS })
    const loopWrapped = wrapSteps(only, ["only"], "loop")
    if (loopWrapped.ok) {
      expect(removeStructure(loopWrapped.manifest, loopWrapped.manifest.steps[0]!.id)).toMatchObject({
        ok: false,
        reason: STRUCTURE_EDIT_EMPTY_STEPS,
      })
    }
  })

  it("deleteStep collapses parallel with nested empty loop", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [
              {
                type: "loop",
                id: "L",
                mode: "for",
                as: "i",
                input: { count: 1 },
                steps: [
                  { id: "only", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "only", mode: "replace" },
                ],
              },
            ],
            [{ id: "keep", uses: "@executioncontrolprotocol/test.echo", input: { value: "k" }, as: "keep" }],
          ],
        },
      ],
    }
    const after = deleteStep(manifest, "only")
    expect(after.ok).toBe(true)
    if (after.ok) {
      const text = JSON.stringify(after.manifest)
      expect(text).toContain("keep")
      expect(text).not.toContain("only")
    }
  })

  it("unwrapStructure removes a nested parallel leaving steps in place", () => {
    const base = flatTwoStep()
    const wrapped = wrapSteps(base, ["A", "B"], "parallel")
    if (!wrapped.ok) throw new Error("wrap failed")
    const id = wrapped.manifest.steps[0]!.id
    const unwrapped = unwrapStructure(wrapped.manifest, id)
    expect(unwrapped.ok && unwrapped.manifest).toEqual(base)
  })

  it("removeStructure drops the subtree", () => {
    const base = flatTwoStep()
    const removed = removeStructure(base, "missing")
    expect(removed).toMatchObject({ ok: false, reason: "Structure not found" })
    const wrapped = wrapSteps(base, ["A", "B"], "if")
    if (!wrapped.ok) throw new Error("wrap failed")
    const id = wrapped.manifest.steps[0]!.id
    const after = removeStructure(wrapped.manifest, id)
    expect(after).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS })
  })

  it("wrapSteps loop requires one contiguous step", () => {
    const base = flatTwoStep()
    const wrapped = wrapSteps(base, ["A"], "loop")
    expect(wrapped.ok).toBe(true)
    if (wrapped.ok) {
      const loop = wrapped.manifest.steps[0]!
      expect(loop.type).toBe("loop")
      if (loop.type === "loop") expect(loop.steps[0]!.id).toBe("A")
    }
    expect(wrapSteps(base, ["A", "B", "missing"], "loop")).toMatchObject({ ok: false })
  })

  it("setLoopField updates loop as and refuses unknown structures", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "L",
          mode: "for",
          as: "i",
          input: { count: 2 },
          steps: [{ id: "S", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, mode: "replace" }],
        },
      ],
    }
    const ok = setLoopField(manifest, "L", "as", "round")
    expect(ok.ok).toBe(true)
    expect(setLoopField(manifest, "missing", "as", "i")).toMatchObject({ ok: false })
  })

  it("does not mutate the input manifest on failure", () => {
    const base = flatTwoStep()
    const snapshot = structuredClone(base)
    wrapSteps(base, ["A", "missing"], "if")
    expect(base).toEqual(snapshot)
    deleteStep(base, "missing")
    expect(base).toEqual(snapshot)
    expect(deleteStep(base, "missing")).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND })
  })
})
describe("wrapping pattern examples validates", () => {
  const echo = {
    id: "@executioncontrolprotocol/test.echo",
    plugin: "@executioncontrolprotocol/test",
    package: "@executioncontrolprotocol/test",
    pluginVersion: "0.0.0",
    summary: "",
    description: "",
    useCases: [],
    projections: [],
    accepts: { type: "object", properties: { value: {} } },
    returns: { type: "object", properties: { echo: {} } },
  }
  const branch = JSON.parse(
    readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns/branch.ecp.json"), "utf8"),
  ) as ExecutionManifest

  async function errors(manifest: ExecutionManifest): Promise<string[]> {
    const report = await validateExecution(manifest, { capabilities: [echo] })
    return report.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code} ${issue.path}`)
  }

  it.each(["if", "loop"] as const)("wrapping a step that commits `as` in %s stays valid", async (kind) => {
    const result = wrapSteps(branch, ["start"], kind)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(await errors(result.manifest)).toEqual([])
  })

  it("a step wrapped in a for loop is the loop body without an explicit commit mode", () => {
    const result = wrapSteps(branch, ["start"], "loop")
    if (!result.ok) throw new Error(result.reason)
    const loop = result.manifest.steps[0] as { mode?: string; steps: Array<{ mode?: string }> }
    expect(loop.mode).toBe("for")
    expect(loop.steps[0]?.mode).toBeUndefined()
  })

  it("wrapping two sibling nodes in parallel stays valid", async () => {
    const result = wrapSteps(branch, ["start", "by-tier"], "parallel")
    if (!result.ok) throw new Error(result.reason)
    expect(await errors(result.manifest)).toEqual([])
  })

  it("addControlNode inserts an if at the top", () => {
    const base = load("smallest.ecp.json")
    const result = addControlNode(base, { kind: "top", after: "echo" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const inserted = result.manifest.steps.find((node) => node.id === result.structureId)
    expect(inserted?.type).toBe("if")
    expect(inserted?.type === "if" && inserted.expression).toBe("true")
  })

  it("addControlNode supports tunnel placements and refuses bad anchors", () => {
    const echo = "@executioncontrolprotocol/test.echo"
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "seed", uses: echo, as: "seed" },
        {
          type: "if",
          id: "gate",
          expression: "true",
          then: [{ id: "t", uses: echo, as: "t" }],
          else: [{ id: "e", uses: echo, as: "e" }],
        },
        {
          type: "parallel",
          id: "p",
          paths: [
            [{ id: "a", uses: echo, as: "a" }],
            [{ id: "b", uses: echo, as: "b" }],
          ],
        },
        { type: "loop", id: "l", mode: "for", as: "i", input: { count: 1 }, steps: [{ id: "body", uses: echo, as: "body" }] },
      ],
    }
    const push = addControlNode(manifest, { kind: "top" })
    expect(push.ok).toBe(true)
    if (!push.ok) return
    expect(push.manifest.steps.at(-1)?.type).toBe("if")

    const thenSide = addControlNode(manifest, { kind: "then-side", ifId: "gate" })
    expect(thenSide.ok).toBe(true)
    if (thenSide.ok) {
      const gate = thenSide.manifest.steps[1]!
      expect(gate.type === "if" && gate.then[0]?.type).toBe("if")
    }

    const elseSide = addControlNode(manifest, { kind: "else-side", ifId: "gate" })
    expect(elseSide.ok).toBe(true)
    if (elseSide.ok) {
      const gate = elseSide.manifest.steps[1]!
      expect(gate.type === "if" && gate.else?.[0]?.type).toBe("if")
    }

    const pathSide = addControlNode(manifest, { kind: "path-side", parallelId: "p", pathIndex: 1 })
    expect(pathSide.ok).toBe(true)

    const newPath = addControlNode(manifest, { kind: "new-path", parallelId: "p" })
    expect(newPath.ok).toBe(true)
    if (newPath.ok) {
      const parallel = newPath.manifest.steps[2]
      expect(parallel?.type === "parallel" && parallel.paths).toHaveLength(3)
    }

    const loopBody = addControlNode(manifest, { kind: "loop-body", loopId: "l" })
    expect(loopBody.ok).toBe(true)

    const before = addControlNode(manifest, { kind: "before", nodeId: "t" })
    expect(before.ok).toBe(true)

    const after = addControlNode(manifest, { kind: "after", nodeId: "t" })
    expect(after.ok).toBe(true)

    expect(addControlNode(manifest, { kind: "top", after: "missing" })).toMatchObject({ ok: false })
    expect(addControlNode(manifest, { kind: "loop-body", loopId: "gate" })).toMatchObject({ ok: false })
    expect(addControlNode(manifest, { kind: "path-side", parallelId: "p", pathIndex: 9 })).toMatchObject({ ok: false })
  })
})
