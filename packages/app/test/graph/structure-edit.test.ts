import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  STRUCTURE_EDIT_CONTIGUOUS,
  STRUCTURE_EDIT_EMPTY_STEPS,
  STRUCTURE_EDIT_PARALLEL_MIN,
  STRUCTURE_EDIT_STEP_NOT_FOUND,
  deleteStep,
  removeStructure,
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
    expect(wrapSteps(flatTwoStep(), [], "branch")).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND })
  })

  it("wrapSelectionIds prefers the multi-selection", () => {
    expect(wrapSelectionIds(["A", "B"], "A")).toEqual(["A", "B"])
    expect(wrapSelectionIds(["A", "B"], "C")).toEqual(["C"])
  })

  it("wrapSteps branch and round-trips", () => {
    const base = flatTwoStep()
    const wrapped = wrapSteps(base, ["A", "B"], "branch")
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
    expect(wrapSteps(parallel, ["left", "right"], "branch")).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_CONTIGUOUS })
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
        { id: "branch-1", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "branch-1" },
      ],
    } as ExecutionManifest
    const wrapped = wrapSteps(manifest, ["A"], "branch")
    expect(wrapped.ok).toBe(true)
    if (wrapped.ok) expect(wrapped.manifest.steps[0]!.id).toBe("branch-2")
  })

  it("allocates branch-2 when branch-1 exists", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "branch-1",
          branches: [{ label: "a", steps: [{ id: "x", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }] }],
        },
        { id: "wrap-me", uses: "@executioncontrolprotocol/test.echo", input: { value: "y" }, as: "wrap-me" },
      ],
    }
    const wrapped = wrapSteps(manifest, ["wrap-me"], "branch")
    expect(wrapped.ok).toBe(true)
    if (wrapped.ok) expect(wrapped.manifest.steps.some((node) => node.id === "branch-2")).toBe(true)
  })

  it("deleteStep cascades parallel to a single line", () => {
    const base = flatTwoStep()
    const wrapped = wrapSteps(base, ["A", "B"], "parallel")
    if (!wrapped.ok) throw new Error("wrap failed")
    const deleted = deleteStep(wrapped.manifest, "A")
    expect(deleted.ok).toBe(true)
    if (deleted.ok) {
      expect(deleted.manifest.steps.map((node) => (node as { id?: string }).id)).toEqual(["B"])
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
          branches: [
            [
              {
                type: "loop",
                id: "L",
                expr: "(state) => true",
                maxRounds: 1,
                steps: [
                  { id: "only", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "only" },
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
    const wrapped = wrapSteps(base, ["A", "B"], "branch")
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

  it("does not mutate the input manifest on failure", () => {
    const base = flatTwoStep()
    const snapshot = structuredClone(base)
    wrapSteps(base, ["A", "missing"], "branch")
    expect(base).toEqual(snapshot)
    deleteStep(base, "missing")
    expect(base).toEqual(snapshot)
    expect(deleteStep(base, "missing")).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND })
  })
})