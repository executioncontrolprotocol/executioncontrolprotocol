import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  executionToReactFlow,
  loopEndNodeId,
  LOOP_INDEX_HANDLE,
  LOOP_ITEMS_HANDLE,
  setLoopField,
  removeStructure,
  unwrapStructure,
  wrapSteps,
  STRUCTURE_EDIT_EMPTY_STEPS,
} from "../../src/graph/index.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const patternsDir = path.resolve(here, "../../../../examples/patterns")
const patternNames = readdirSync(patternsDir).filter((name) => name.endsWith(".ecp.json")).sort()

function load(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(patternsDir, name), "utf8")) as ExecutionManifest
}

describe("executionToReactFlow pattern examples", () => {
  it.each(patternNames)("%s encodes without structural edges", (name) => {
    const doc = executionToReactFlow(load(name))
    expect(doc.nodes.length).toBeGreaterThan(0)
    expect(doc.edges.every((e) => e.data.kind === "data")).toBe(true)
    expect(doc.edges.every((e) => e.data.kind === "data")).toBe(true)
  })

  it("while loop has no item port on the start node", () => {
    const doc = executionToReactFlow(load("loop-while.ecp.json"))
    const loop = doc.nodes.find((n) => n.type === "ecp-loop")
    expect(loop).toBeDefined()
    const data = loop!.data as { outputs: Array<{ id: string }> }
    expect(data.outputs.some((p) => p.id === LOOP_ITEMS_HANDLE)).toBe(false)
    expect(data.outputs.some((p) => p.id === LOOP_INDEX_HANDLE)).toBe(false)
  })

  it("nested-foreach-branch has end nodes and containers", () => {
    const doc = executionToReactFlow(load("nested-foreach-branch.ecp.json"))
    const loops = doc.nodes.filter((n) => n.type === "ecp-loop")
    for (const loop of loops) {
      expect(doc.nodes.some((n) => n.id === loopEndNodeId(loop.id))).toBe(true)
    }
    expect(doc.nodes.filter((n) => n.type === "ecp-frame").length).toBeGreaterThan(0)
  })

  it("nested-parallel renders parallel start nodes", () => {
    const doc = executionToReactFlow(load("nested-parallel.ecp.json"))
    expect(doc.nodes.filter((n) => n.type === "ecp-parallel").length).toBeGreaterThan(0)
  })
})

describe("structure-edit loop panel fields", () => {
  const base: ExecutionManifest = {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      {
        type: "loop",
        id: "L",
        mode: "while",
        maxRounds: 3,
        steps: [{ id: "S", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }],
        end: { input: { repeat: false } },
      },
    ],
  }

  it("setLoopField updates known fields and rejects unknown", () => {
    expect(setLoopField(base, "L", "maxRounds", 5).ok).toBe(true)
    expect(setLoopField(base, "L", "mode", "forEach").ok).toBe(true)
    expect(setLoopField(base, "missing", "maxRounds", 1)).toMatchObject({ ok: false })
    expect(setLoopField(base, "L", "bad", 1)).toMatchObject({ ok: false })
  })

  it("removeStructure and unwrapStructure on a wrapped if", () => {
    const flat: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" } },
        { id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" } },
      ],
    }
    const wrapped = wrapSteps(flat, ["A"], "if")
    expect(wrapped.ok).toBe(true)
    if (!wrapped.ok) return
    const ifId = wrapped.manifest.steps[0]!.id
    expect(unwrapStructure(wrapped.manifest, ifId).ok).toBe(true)
    const twoStepIf = wrapSteps(flat, ["A", "B"], "if")
    expect(twoStepIf.ok).toBe(true)
    if (twoStepIf.ok) {
      const id = twoStepIf.manifest.steps[0]!.id
      expect(removeStructure(twoStepIf.manifest, id)).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS })
    }
  })
})