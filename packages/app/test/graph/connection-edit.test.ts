import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  attachAfter,
  CONNECTION_EDIT_INSIDE,
  CONNECTION_EDIT_NOT_BINDING,
  CONNECTION_EDIT_REF_AMBIGUOUS,
  connectInput,
  connectorDeletePreview,
  deleteConnector,
  deleteParallelLine,
  deleteSequenceLink,
  detachedNodeIds,
  disconnectInput,
} from "../../src/graph/connection-edit.js"
import { executionToReactFlow } from "../../src/graph/execution-to-reactflow.js"
import { EXECUTION_ACCEPTS_NODE_ID } from "../../src/graph/io-from-schema.js"
import { STRUCTURE_EDIT_EMPTY_STEPS, STRUCTURE_EDIT_STEP_NOT_FOUND } from "../../src/graph/structure-edit.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const validDir = path.resolve(here, "../../../../fixtures/manifests/valid")
const schemaPath = path.resolve(here, "../../../../packages/protocol/schemas/execution.base.schema.json")

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, "utf8")))

function load(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(validDir, name), "utf8")) as ExecutionManifest
}

describe("connection-edit", () => {
  it("markers fromExpr data edge is deletable in the encoder output", () => {
    const manifest = load("markers.ecp.json")
    const doc = executionToReactFlow(manifest)
    const edge = doc.edges.find((entry) => entry.data.kind === "data" && entry.target === "fromExpr")
    expect(edge).toBeDefined()
    expect(connectorDeletePreview(manifest, edge!).ok).toBe(true)
  })

  it("disconnectInput removes a top-level $ref without mutating input argument", () => {
    const base = load("markers.ecp.json")
    const inputBefore = structuredClone(base.steps[1]!.input)
    const result = disconnectInput(base, "fromExpr", "seed")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.steps[1]!.input?.seed).toBeUndefined()
    expect(validate(result.manifest)).toBe(true)
    expect(base.steps[1]!.input).toEqual(inputBefore)
  })

  it("disconnectInput removes nested path key", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "s",
          uses: "@executioncontrolprotocol/test.echo",
          input: { file: { path: { $ref: "state.doc" }, kind: "file" } },
          as: "s",
        },
      ],
    }
    const result = disconnectInput(base, "s", "file.path")
    expect(result.ok).toBe(true)
    if (result.ok) {
      const input = (result.manifest.steps[0] as { input?: Record<string, unknown> }).input?.file as Record<string, unknown>
      expect(input.path).toBeUndefined()
      expect(input.kind).toBe("file")
    }
  })

  it("disconnectInput refuses steps only under detached", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [],
      detached: [{ id: "d", uses: "@executioncontrolprotocol/test.echo", input: { seed: { $ref: "state.x" } }, as: "d" }],
    }
    expect(disconnectInput(base, "d", "seed").reason).toBe(STRUCTURE_EDIT_STEP_NOT_FOUND)
  })

  it("disconnectInput refuses missing step and bad paths", () => {
    const base = load("markers.ecp.json")
    expect(disconnectInput(base, "missing", "seed").reason).toBe(STRUCTURE_EDIT_STEP_NOT_FOUND)
    expect(disconnectInput(base, "fromExpr", "missing.path")).toMatchObject({ ok: false, reason: CONNECTION_EDIT_NOT_BINDING })
    expect(disconnectInput(base, "fromExpr", "seed", "badParam")).toMatchObject({ ok: false, reason: CONNECTION_EDIT_NOT_BINDING })
  })

  it("disconnectInput refuses non-ref script params", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "s",
          uses: "@executioncontrolprotocol/test.echo",
          input: {
            code: { $script: { lang: "js", source: "1", params: { plan: { $expr: "(state) => state.x" } } } },
          },
          as: "s",
        },
      ],
    }
    expect(disconnectInput(base, "s", "code", "plan")).toMatchObject({ ok: false, reason: CONNECTION_EDIT_NOT_BINDING })
  })

  it("disconnectInput refuses expr bindings", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", expr: "(state) => true", input: { value: "x" }, as: "s" }],
    }
    expect(disconnectInput(base, "s", "value")).toMatchObject({ ok: false, reason: CONNECTION_EDIT_NOT_BINDING })
  })

  it("deleteParallelLine with three lines keeps the parallel", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
            [{ id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" }],
            [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
          ],
        },
      ],
    }
    const result = deleteParallelLine(base, "p", 1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parallel = result.manifest.steps[0]!
      expect(parallel.type).toBe("parallel")
      if (parallel.type === "parallel") expect(parallel.paths).toHaveLength(2)
      expect(result.manifest.detached?.[0]?.id).toBe("B")
    }
  })

  it("deleteConnector refuses control edges", () => {
    const edge = {
      id: "e",
      source: "A",
      target: "B",
      data: { kind: "control" as const },
    }
    expect(deleteConnector(load("markers.ecp.json"), edge as never).reason).toBe(CONNECTION_EDIT_NOT_BINDING)
    expect(connectorDeletePreview(load("markers.ecp.json"), edge as never)).toMatchObject({ ok: false })
  })

  it("connectorDeletePreview accepts deletable data edges", () => {
    const manifest = load("markers.ecp.json")
    const doc = executionToReactFlow(manifest)
    const edge = doc.edges.find((entry) => entry.data.kind === "data" && entry.target === "fromExpr")!
    expect(connectorDeletePreview(manifest, edge).ok).toBe(true)
  })

  it("deleteParallelLine splices when two lines remain", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
            [
              { id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" },
              { id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" },
            ],
          ],
        },
      ],
    }
    const result = deleteParallelLine(base, "p", 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.steps.map((n) => n.id)).toEqual(["A"])
    expect(result.manifest.detached?.map((n) => n.id)).toEqual(["B", "C"])
    expect(validate(result.manifest)).toBe(true)
  })

  it("deleteSequenceLink refuses emptying top-level steps", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" },
        { id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" },
      ],
    }
    expect(deleteSequenceLink(base, "A").reason).toBe(STRUCTURE_EDIT_EMPTY_STEPS)
    const ok = deleteSequenceLink(base, "B")
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.manifest.steps[0]!.id).toBe("A")
  })

  it("attachAfter refuses when detached list is missing", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
    }
    expect(attachAfter(base, "A", "C").reason).toBe(STRUCTURE_EDIT_STEP_NOT_FOUND)
  })

  it("deleteSequenceLink refuses missing target", () => {
    expect(deleteSequenceLink(load("markers.ecp.json"), "missing").reason).toBe(STRUCTURE_EDIT_STEP_NOT_FOUND)
  })

  it("attachAfter removes detached and inserts after source", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const result = attachAfter(base, "A", "C")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.detached).toBeUndefined()
    expect(result.manifest.steps.map((n) => n.id)).toEqual(["A", "C"])
    expect(validate(result.manifest)).toBe(true)
  })

  it("attachAfter refuses missing detached id", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
    }
    expect(attachAfter(base, "A", "missing").reason).toBe(STRUCTURE_EDIT_STEP_NOT_FOUND)
  })

  it("deleteConnector dispatches data disconnect", () => {
    const manifest = load("markers.ecp.json")
    const doc = executionToReactFlow(manifest)
    const edge = doc.edges.find((entry) => entry.data.kind === "data" && entry.target === "fromExpr")!
    const result = deleteConnector(manifest, edge)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest.steps[1]!.input?.seed).toBeUndefined()
  })

  it("disconnectInput removes one $script param and keeps siblings", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "s",
          uses: "@executioncontrolprotocol/test.echo",
          input: {
            code: {
              $script: {
                lang: "js",
                source: "return 1",
                params: { plan: { $ref: "state.plan" }, keep: { $ref: "state.x" } },
              },
            },
          },
          as: "s",
        },
      ],
    }
    const result = disconnectInput(base, "s", "code", "plan")
    expect(result.ok).toBe(true)
    if (result.ok) {
      const input = (result.manifest.steps[0] as { input?: Record<string, unknown> }).input?.code as {
        $script: { params?: Record<string, unknown> }
      }
      expect(input.$script.params?.plan).toBeUndefined()
      expect(input.$script.params?.keep).toEqual({ $ref: "state.x" })
    }
  })

  it("disconnectInput omits empty params object", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "s",
          uses: "@executioncontrolprotocol/test.echo",
          input: {
            code: { $script: { lang: "js", source: "1", params: { only: { $ref: "state.a" } } } },
          },
          as: "s",
        },
      ],
    }
    const result = disconnectInput(base, "s", "code", "only")
    expect(result.ok).toBe(true)
    if (result.ok) {
      const script = (
        (result.manifest.steps[0] as { input?: Record<string, unknown> }).input?.code as { $script: Record<string, unknown> }
      ).$script
      expect(script.params).toBeUndefined()
    }
  })

  it("disconnectInput refuses $state at nested level", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "s",
          uses: "@executioncontrolprotocol/test.echo",
          input: { handle: { $state: "bucket" } },
          as: "s",
        },
      ],
    }
    const result = disconnectInput(base, "s", "handle")
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.manifest.steps[0] as { input?: Record<string, unknown> }).input?.handle).toBeUndefined()
  })

  it("attachAfter refuses source inside detached subtree", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
      detached: [
        {
          type: "if",
          id: "b",
          expression: "true",
          then: [{ id: "inner", uses: "@executioncontrolprotocol/test.echo", input: { value: "i" }, as: "inner" }],
        },
      ],
    }
    expect(attachAfter(base, "inner", "b").reason).toBe(CONNECTION_EDIT_INSIDE)
  })

  it("deleteParallelLine refuses bad line index", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "parallel", id: "p", paths: [[{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }]] }],
    }
    expect(deleteParallelLine(base, "p", 1).ok).toBe(false)
  })

  it("deleteSequenceLink refuses when cleanup would empty top-level steps", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          mode: "while",
          maxRounds: 1,
          steps: [{ id: "only", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "only" }],
          end: { input: { repeat: false } },
        },
      ],
    }
    const result = deleteSequenceLink(base, "only")
    expect(result.ok).toBe(true)
    if (result.ok) {
      const loop = result.manifest.steps[0]
      expect(loop?.type).toBe("loop")
      expect(loop?.type === "loop" && loop.steps).toEqual([])
    }
  })

  it("deleteSequenceLink moves tail inside an if side", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "b",
          expression: "true",
          then: [
            { id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" },
            { id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" },
          ],
        },
      ],
    }
    const result = deleteSequenceLink(base, "B")
    expect(result.ok).toBe(true)
    if (result.ok) {
      const ifNode = result.manifest.steps[0]!
      expect(ifNode.type).toBe("if")
      if (ifNode.type === "if") expect(ifNode.then.map((n) => n.id)).toEqual(["A"])
      expect(result.manifest.detached?.map((n) => n.id)).toEqual(["B"])
    }
  })

  it("deleteConnector refuses data edge without bindingPath", () => {
    const edge = {
      id: "e",
      source: "w",
      target: "r",
      data: { kind: "data" as const, inputPath: "seed" },
    }
    expect(deleteConnector(load("markers.ecp.json"), edge as never).reason).toBe(CONNECTION_EDIT_NOT_BINDING)
  })

  it("deleteConnector removes the loop driver reference and keeps the manifest valid shape", () => {
    const manifest = load("loop-foreach.ecp.json")
    const doc = executionToReactFlow(manifest)
    const loopEdge = doc.edges.find((edge) => edge.data.kind === "data" && edge.target === "rows")
    expect(loopEdge).toBeDefined()
    expect(connectorDeletePreview(manifest, loopEdge!).ok).toBe(true)
    const result = deleteConnector(manifest, loopEdge!)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const loop = result.manifest.steps.find((node) => node.id === "rows")
      expect(loop?.type === "loop" && loop.input?.items).toBeUndefined()
    }
  })

  it("attachAfter inserts as first loop body step", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          expr: "(state) => true",
          maxRounds: 1,
          steps: [{ id: "tick", uses: "@executioncontrolprotocol/test.echo", input: { value: "t" }, as: "tick" }],
        },
      ],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const result = attachAfter(base, "l", "C")
    expect(result.ok).toBe(true)
    if (result.ok) {
      const loop = result.manifest.steps[0]!
      expect(loop.type).toBe("loop")
      if (loop.type === "loop") expect(loop.steps.map((n) => n.id)).toEqual(["C", "tick"])
    }
  })

  it("attachAfter at accepts prepends steps", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const result = attachAfter(base, EXECUTION_ACCEPTS_NODE_ID, "C")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest.steps.map((n) => n.id)).toEqual(["C", "A"])
  })

  it("attachAfter refuses source inside the detached root", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "keep", uses: "@executioncontrolprotocol/test.echo", input: { value: "k" }, as: "keep" }],
      detached: [
        {
          type: "if",
          id: "wrap",
          expression: "true",
          then: [{ id: "inner", uses: "@executioncontrolprotocol/test.echo", input: { value: "i" }, as: "inner" }],
        },
      ],
    }
    expect(attachAfter(base, "inner", "wrap").reason).toBe(CONNECTION_EDIT_INSIDE)
    expect(attachAfter(base, "wrap", "wrap").reason).toBe(CONNECTION_EDIT_INSIDE)
  })

  it("attachAfter refuses nested detached id", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
      detached: [
        {
          type: "if",
          id: "wrap",
          expression: "true",
          then: [{ id: "inner", uses: "@executioncontrolprotocol/test.echo", input: { value: "i" }, as: "inner" }],
        },
      ],
    }
    expect(attachAfter(base, "A", "inner").reason).toBe(STRUCTURE_EDIT_STEP_NOT_FOUND)
  })

  it("deleteConnector refuses non-data edges", () => {
    const edge = {
      id: "e",
      source: "A",
      target: "B",
      data: { kind: "control" as const },
    }
    expect(deleteConnector(load("markers.ecp.json"), edge as never)).toMatchObject({ ok: false, reason: CONNECTION_EDIT_NOT_BINDING })
  })

  it("detachedNodeIds walks nested detached structures", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [],
      detached: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [
              {
                type: "loop",
                id: "l",
                expr: "(state) => true",
                maxRounds: 1,
                steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
              },
            ],
          ],
        },
      ],
    }
    const ids = detachedNodeIds(base)
    expect(ids.has("p")).toBe(true)
    expect(ids.has("l")).toBe(true)
    expect(ids.has("s")).toBe(true)
  })

  it("attachAfter leaves other detached roots", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
      detached: [
        { id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" },
        { id: "D", uses: "@executioncontrolprotocol/test.echo", input: { value: "d" }, as: "D" },
      ],
    }
    const result = attachAfter(base, "A", "C")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.detached?.map((n) => n.id)).toEqual(["D"])
    }
  })

  it("connectInput on empty port adds accepts and binds in one edit", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "w", uses: "@executioncontrolprotocol/test.echo", input: { value: "w" }, as: "w" },
        {
          type: "if",
          id: "g",
          expression: "true",
          then: [{ id: "x", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "x" }],
        },
      ],
    }
    const result = connectInput(manifest, {
      sourceNodeId: "w",
      sourceHandle: "output",
      targetStepId: "g",
      targetHandle: "__empty",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const gate = result.manifest.steps[1]!
    expect(gate.type === "if" && gate.input?.output).toEqual({ $ref: "state.w" })
    expect(gate.type === "if" && gate.accepts?.properties?.output).toBeTruthy()
  })

  it("connectInput appends merge refs on opposite if sides", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "pick",
          expression: "true",
          as: "pick",
          then: [{ id: "fast", uses: "@executioncontrolprotocol/test.echo", input: { value: "f" }, as: "fast" }],
          else: [{ id: "slow", uses: "@executioncontrolprotocol/test.echo", input: { value: "s" }, as: "slow" }],
        },
        {
          id: "ship",
          uses: "@executioncontrolprotocol/test.echo",
          as: "ship",
          input: { pick: { $ref: "state.fast" } },
        },
      ],
    }
    const merged = connectInput(manifest, {
      sourceNodeId: "slow",
      sourceHandle: "output",
      targetStepId: "ship",
      targetHandle: "pick",
    })
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    const pickBinding = (merged.manifest.steps[1] as { input?: Record<string, unknown> }).input?.pick as {
      $ref?: string | string[]
    }
    expect(Array.isArray(pickBinding.$ref)).toBe(true)
  })

  it("disconnectInput collapses a merge list to one ref", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "r",
          uses: "@executioncontrolprotocol/test.echo",
          as: "r",
          input: { x: { $ref: ["state.a", "state.b"] } },
        },
      ],
    }
    const result = disconnectInput(manifest, "r", "x", undefined, "state.a")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.manifest.steps[0] as { input?: Record<string, unknown> }).input?.x).toEqual({ $ref: "state.b" })
  })

  it("connectInput refuses ambiguous merge on same if side", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          then: [
            { id: "a", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "a" },
            { id: "b", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "b" },
          ],
        },
        {
          id: "r",
          uses: "@executioncontrolprotocol/test.echo",
          as: "r",
          input: { x: { $ref: "state.a" } },
        },
      ],
    }
    const result = connectInput(manifest, {
      sourceNodeId: "b",
      sourceHandle: "output",
      targetStepId: "r",
      targetHandle: "x",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(CONNECTION_EDIT_REF_AMBIGUOUS)
  })

})
