import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { executionToReactFlow } from "../../src/graph/execution-to-reactflow.js"
import {
  addArmCondition,
  makeDefaultArm,
  ROUTE_EDIT_ARM_HAS_CONDITION,
  ROUTE_EDIT_DEFAULT_EXISTS,
  setArmLabel,
  setLoopField,
} from "../../src/graph/route-edit.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const validDir = path.resolve(here, "../../../../fixtures/manifests/valid")

function load(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(validDir, name), "utf8")) as ExecutionManifest
}

describe("route-edit", () => {
  it("encoder levels for nested-branch edge into x", () => {
    const base = load("nested-branch.ecp.json")
    const doc = executionToReactFlow(base)
    const edge = doc.edges.find((entry) => entry.data.kind === "route" && entry.target === "x")
    expect(edge?.data.kind).toBe("route")
    if (edge?.data.kind === "route") {
      expect(edge.data.levels[0]).toMatchObject({ structureId: "outer", armIndex: 0 })
    }
    const updated = addArmCondition(base, "outer", 1)
    if (!updated.ok) throw new Error("setup")
    const after = executionToReactFlow(updated.manifest)
    const edgeAfter = after.edges.find((entry) => entry.data.kind === "route" && entry.target === "x")
    expect(edgeAfter?.id).toBe(edge?.id)
  })
  it("setArmLabel refuses out-of-range arm index", () => {
    const base = load("nested-branch.ecp.json")
    expect(setArmLabel(base, "outer", 9, "x")).toMatchObject({ ok: false })
    expect(addArmCondition(base, "outer", 9)).toMatchObject({ ok: false })
  })

  it("setArmLabel sets a non-empty label", () => {
    const base = load("nested-branch.ecp.json")
    const result = setArmLabel(base, "outer", 1, "fallback")
    expect(result.ok).toBe(true)
    if (result.ok) {
      const outer = result.manifest.steps.find((node) => node.id === "outer")
      if (outer?.type === "branch") expect(outer.branches[1]!.label).toBe("fallback")
    }
    expect(setArmLabel(base, "missing", 0, "x")).toMatchObject({ ok: false })
  })

  it("setArmLabel clears the key on empty string", () => {
    const base = load("nested-branch.ecp.json")
    const result = setArmLabel(base, "outer", 0, "")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const outer = result.manifest.steps.find((node) => node.id === "outer")
    expect(outer?.type).toBe("branch")
    if (outer?.type === "branch") expect(outer.branches[0]!.label).toBeUndefined()
  })

  it("addArmCondition writes default expr", () => {
    const base = load("nested-branch.ecp.json")
    const result = addArmCondition(base, "outer", 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const branch = result.manifest.steps[0]!
    if (branch.type === "branch") expect(branch.branches[1]!.expr).toBe("(state) => true")
    expect(addArmCondition(result.manifest, "outer", 1)).toMatchObject({
      ok: false,
      reason: ROUTE_EDIT_ARM_HAS_CONDITION,
    })
  })

  it("makeDefaultArm succeeds when the arm is already last", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "b",
          branches: [
            { expr: "(state) => true", steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }] },
            { steps: [{ id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" }] },
          ],
        },
      ],
    }
    const withExpr = addArmCondition(base, "b", 1)
  if (!withExpr.ok) throw new Error("setup")
    const result = makeDefaultArm(withExpr.manifest, "b", 1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const branch = result.manifest.steps[0]!
      if (branch.type === "branch") expect(branch.branches[1]!.expr).toBeUndefined()
    }
  })

  it("makeDefaultArm on arm 0 after both arms are conditional", () => {
    const withDefaultExpr = addArmCondition(load("nested-branch.ecp.json"), "outer", 1)
    if (!withDefaultExpr.ok) throw new Error("setup")
    const result = makeDefaultArm(withDefaultExpr.manifest, "outer", 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const outer = result.manifest.steps.find((node) => node.id === "outer")
    expect(outer?.type).toBe("branch")
    if (outer?.type === "branch") {
      const last = outer.branches[outer.branches.length - 1]!
      expect(last.expr).toBeUndefined()
      expect(last.steps[0]?.id).toBe("inner")
    }
  })

  it("makeDefaultArm moves conditional arm last", () => {
    const withExpr = addArmCondition(load("nested-branch.ecp.json"), "outer", 1)
    if (!withExpr.ok) throw new Error("setup failed")
    const result = makeDefaultArm(withExpr.manifest, "outer", 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const branch = result.manifest.steps[0]!
    if (branch.type === "branch") {
      expect(branch.branches[branch.branches.length - 1]!.steps[0]!.id).toBe("n")
      expect(branch.branches[branch.branches.length - 1]!.expr).toBeUndefined()
    }
  })

  it("makeDefaultArm refuses when another default exists", () => {
    const base = load("nested-branch.ecp.json")
    expect(makeDefaultArm(base, "outer", 0)).toMatchObject({ ok: false, reason: ROUTE_EDIT_DEFAULT_EXISTS })
  })

  it("setLoopField enforces mode-specific fields", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          mode: "for",
          ref: "state.items",
          as: "item",
          steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
        },
      ],
    }
    expect(setLoopField(base, "l", "maxRounds", 3)).toMatchObject({ ok: false })
    expect(setLoopField(base, "l", "as", "item2").ok).toBe(true)
  })

  it("setLoopField accepts boundary maxRounds and concurrency", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          ref: "state.count",
          maxRounds: 2,
          steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
        },
      ],
    }
    expect(setLoopField(base, "l", "maxRounds", 1000).ok).toBe(true)
    const forEach: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          mode: "forEach",
          ref: "state.items",
          as: "row",
          into: "out",
          collect: "state.out",
          steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
        },
      ],
    }
    expect(setLoopField(forEach, "l", "concurrency", 32).ok).toBe(true)
    expect(setLoopField(forEach, "l", "collect", "state.bad!")).toMatchObject({ ok: false })
  })

  it("setLoopField validates while driver and maxRounds", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          ref: "state.count",
          maxRounds: 2,
          steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
        },
      ],
    }
    const switched = setLoopField(base, "l", "expr", "(state) => true")
    expect(switched.ok).toBe(true)
    if (switched.ok) {
      const loop = switched.manifest.steps[0]!
      expect(loop.type).toBe("loop")
      if (loop.type === "loop") {
        expect(loop.ref).toBeUndefined()
        expect(loop.expr).toBe("(state) => true")
      }
    }
    expect(setLoopField(base, "l", "ref", "bad")).toMatchObject({ ok: false })
    expect(setLoopField(base, "l", "maxRounds", 0)).toMatchObject({ ok: false })
    expect(setLoopField(base, "l", "maxRounds", 1001)).toMatchObject({ ok: false })
    expect(setLoopField(base, "l", "into", "x")).toMatchObject({ ok: false })
  })

  it("setLoopField forEach accepts collect concurrency and onError", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          mode: "forEach",
          ref: "state.items",
          as: "row",
          into: "out",
          collect: "state.out",
          steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
        },
      ],
    }
    expect(setLoopField(base, "l", "concurrency", 4).ok).toBe(true)
    expect(setLoopField(base, "l", "onError", "continue").ok).toBe(true)
    expect(setLoopField(base, "l", "onError", "abort")).toMatchObject({ ok: false })
    expect(setLoopField(base, "l", "collect", "state.bucket")).toMatchObject({ ok: true })
  })

  it("setLoopField rejects empty expr and invalid for as", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          mode: "for",
          ref: "state.items",
          as: "item",
          steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
        },
      ],
    }
    expect(setLoopField(base, "l", "expr", "   ")).toMatchObject({ ok: false })
    expect(setLoopField(base, "l", "as", "9bad")).toMatchObject({ ok: false })
    expect(setLoopField(base, "l", "concurrency", 64)).toMatchObject({ ok: false })
  })

  it("addArmCondition refuses missing branch", () => {
    const base = load("nested-branch.ecp.json")
    expect(addArmCondition(base, "missing", 0)).toMatchObject({ ok: false })
    expect(makeDefaultArm(base, "missing", 0)).toMatchObject({ ok: false })
  })

  it("setLoopField validates forEach into identifier", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          mode: "forEach",
          ref: "state.items",
          as: "row",
          into: "out",
          collect: "state.out",
          steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
        },
      ],
    }
    expect(setLoopField(base, "l", "into", "bad-name").ok).toBe(false)
    expect(setLoopField(base, "l", "as", "ok_name").ok).toBe(true)
  })

  it("setLoopField refuses missing loop", () => {
    const base = load("nested-branch.ecp.json")
    expect(setLoopField(base, "missing", "maxRounds", 2)).toMatchObject({ ok: false })
  })

  it("setLoopField finds a loop under detached", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [],
      detached: [
        {
          type: "loop",
          id: "l",
          ref: "state.n",
          maxRounds: 1,
          steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
        },
      ],
    }
    expect(setLoopField(base, "l", "maxRounds", 3).ok).toBe(true)
  })
})