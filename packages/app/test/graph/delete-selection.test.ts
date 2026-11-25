import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { CONNECTION_EDIT_LOOP, connectorDeletePreview } from "../../src/graph/connection-edit.js"
import { deleteSelection, isStructureHeaderSelection } from "../../src/graph/delete-selection.js"
import { executionToReactFlow } from "../../src/graph/execution-to-reactflow.js"
import { routeDeleteTarget } from "../../src/graph/route-edge-label.js"
import { STRUCTURE_EDIT_EMPTY_STEPS } from "../../src/graph/structure-edit.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const validDir = path.resolve(here, "../../../../fixtures/manifests/valid")
const schemaPath = path.resolve(here, "../../../../packages/protocol/schemas/execution.base.schema.json")

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, "utf8")))

function load(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(validDir, name), "utf8")) as ExecutionManifest
}

const echo = "@executioncontrolprotocol/test.echo"

describe("deleteSelection", () => {
  it("removes one or more selected steps in a single result", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "A", uses: echo, input: { value: "a" }, as: "A" },
        { id: "B", uses: echo, input: { value: "b" }, as: "B" },
        { id: "C", uses: echo, input: { value: "c" }, as: "C" },
      ],
    }
    const one = deleteSelection(base, { kind: "steps", stepIds: ["B"] }, false)
    expect(one?.ok).toBe(true)
    if (!one?.ok) return
    expect(one.manifest.steps.map((node) => node.id)).toEqual(["A", "C"])
    expect(validate(one.manifest)).toBe(true)

    const two = deleteSelection(base, { kind: "steps", stepIds: ["A", "C"] }, false)
    expect(two?.ok).toBe(true)
    if (!two?.ok) return
    expect(two.manifest.steps.map((node) => node.id)).toEqual(["B"])
  })

  it("refuses deleting every top-level step", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "only", uses: echo, input: { value: "x" }, as: "only" }],
    }
    const snapshot = structuredClone(base)
    const single = deleteSelection(base, { kind: "steps", stepIds: ["only"] }, false)
    expect(single).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS })
    expect(base).toEqual(snapshot)

    const pair: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "A", uses: echo, input: { value: "a" }, as: "A" },
        { id: "B", uses: echo, input: { value: "b" }, as: "B" },
      ],
    }
    const pairSnapshot = structuredClone(pair)
    const both = deleteSelection(pair, { kind: "steps", stepIds: ["A", "B"] }, false)
    expect(both).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS })
    expect(pair).toEqual(pairSnapshot)
  })

  it("unwraps a structure without removing its steps", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "route",
          branches: [
            {
              expr: "(state) => true",
              steps: [
                { id: "A", uses: echo, input: { value: "a" }, as: "A" },
                { id: "B", uses: echo, input: { value: "b" }, as: "B" },
              ],
            },
          ],
        },
        { id: "tail", uses: echo, input: { value: "t" }, as: "tail" },
      ],
    }
    const result = deleteSelection(base, { kind: "structure", structureId: "route" }, false)
    expect(result?.ok).toBe(true)
    if (!result?.ok) return
    expect(result.manifest.steps.map((node) => node.id)).toEqual(["A", "B", "tail"])
    expect(result.manifest.steps.some((node) => node.id === "route")).toBe(false)
  })

  it("deletes a route connector at the delete-target level", () => {
    const base = load("nested-branch.ecp.json")
    const doc = executionToReactFlow(base)
    const innerEdge = doc.edges.find((edge) => edge.data.kind === "route" && edge.target === "x")
    expect(innerEdge).toBeDefined()
    const level = routeDeleteTarget(innerEdge!.data.levels)
    expect(level).toBe(1)
    const preview = connectorDeletePreview(base, innerEdge!, level!)
    expect(preview.ok).toBe(true)
    const result = deleteSelection(base, { kind: "connector", edge: innerEdge!, level: level! }, false)
    expect(result?.ok).toBe(true)
    if (!result?.ok) return
    expect(result.manifest.detached?.some((node) => node.id === "x")).toBe(true)
    const outer = result.manifest.steps.find((node) => node.id === "outer")
    expect(outer?.type).toBe("branch")
    if (outer?.type === "branch") {
      const inner = outer.branches[0]?.steps[0]
      expect(inner?.type).toBe("branch")
      if (inner?.type === "branch") {
        expect(inner.branches.some((arm) => arm.steps.some((step) => step.id === "w"))).toBe(true)
      }
    }
  })

  it("returns preview failures for loop routes and the Inputs sequence link", () => {
    const loopManifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "retry",
          expr: "(state) => true",
          maxRounds: 2,
          steps: [{ id: "tick", uses: echo, input: { value: "t" }, as: "tick" }],
        },
      ],
    }
    const loopDoc = executionToReactFlow(loopManifest)
    const loopEdge = loopDoc.edges.find((edge) => edge.data.kind === "route" && edge.data.route === "loop")
    expect(loopEdge).toBeDefined()
    const loopLevel = routeDeleteTarget(loopEdge!.data.levels) ?? 0
    const loopResult = deleteSelection(loopManifest, { kind: "connector", edge: loopEdge!, level: loopLevel }, false)
    expect(loopResult).toMatchObject({ ok: false, reason: CONNECTION_EDIT_LOOP })

    const seqManifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: echo, input: { value: "a" }, as: "A" }],
    }
    const seqDoc = executionToReactFlow(seqManifest)
    const seqEdge = seqDoc.edges.find((edge) => edge.data.kind === "route" && edge.target === "A")
    expect(seqEdge).toBeDefined()
    const seqLevel = routeDeleteTarget(seqEdge!.data.levels) ?? 0
    const seqResult = deleteSelection(seqManifest, { kind: "connector", edge: seqEdge!, level: seqLevel }, false)
    expect(seqResult).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS })
  })

  it("distinguishes structure headers from steps for selection typing", () => {
    const base = load("nested-branch.ecp.json")
    expect(isStructureHeaderSelection(base, "outer")).toBe(true)
    expect(isStructureHeaderSelection(base, "x")).toBe(false)
    expect(isStructureHeaderSelection(base, "missing")).toBe(false)
  })

  it("returns undefined for read-only and empty selections", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: echo, input: { value: "a" }, as: "A" }],
    }
    expect(deleteSelection(base, { kind: "steps", stepIds: ["A"] }, true)).toBeUndefined()
    expect(deleteSelection(base, { kind: "none" }, false)).toBeUndefined()
    expect(deleteSelection(base, { kind: "steps", stepIds: [] }, false)).toBeUndefined()
  })
})