import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  attachAfter,
  attachAsArm,
  attachAsLine,
  CONNECTION_EDIT_INSIDE,
  CONNECTION_EDIT_LOOP,
  CONNECTION_EDIT_NOT_BINDING,
  connectorDeletePreview,
  deleteConnector,
  deleteArm,
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
    expect(connectorDeletePreview(manifest, edge!, 0).ok).toBe(true)
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

  it("deleteArm appends to an existing detached list", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "b",
          branches: [
            { expr: "(state) => true", steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }] },
            { expr: "(state) => false", steps: [{ id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" }] },
          ],
        },
      ],
      detached: [{ id: "old", uses: "@executioncontrolprotocol/test.echo", input: { value: "o" }, as: "old" }],
    }
    const result = deleteArm(base, "b", 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest.detached?.map((n) => n.id)).toEqual(["old", "A"])
  })

  it("deleteParallelLine with three lines keeps the parallel", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          branches: [
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
      if (parallel.type === "parallel") expect(parallel.branches).toHaveLength(2)
      expect(result.manifest.detached?.[0]?.id).toBe("B")
    }
  })

  it("attachAsArm refuses missing in-flow branch", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    expect(attachAsArm(base, "missing", "C").ok).toBe(false)
    expect(attachAsLine(base, "missing", "C").ok).toBe(false)
  })

  it("attachAsLine refuses when target parallel is inside the detached root", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "live",
          branches: [[{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }]],
        },
      ],
      detached: [
        {
          type: "parallel",
          id: "wrap",
          branches: [
            [
              {
                type: "parallel",
                id: "inner",
                branches: [[{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }]],
              },
            ],
          ],
        },
      ],
    }
    expect(attachAsLine(base, "live", "wrap").ok).toBe(true)
    expect(attachAsLine(base, "inner", "wrap").reason).toBe(CONNECTION_EDIT_INSIDE)
  })

  it("deleteConnector refuses unknown route kind", () => {
    const edge = {
      id: "e",
      source: "A",
      target: "B",
      data: { kind: "route" as const, route: "loop" as const, levels: [{ route: "loop" as const }] },
    }
    expect(deleteConnector(load("markers.ecp.json"), edge as never, 0).reason).toBe(CONNECTION_EDIT_NOT_BINDING)
    const unknown = {
      id: "e",
      source: "A",
      target: "B",
      data: { kind: "route" as const, route: "branch" as const, levels: [{ route: "branch" as const }] },
    }
    expect(connectorDeletePreview(load("markers.ecp.json"), unknown as never, 0)).toMatchObject({ ok: false })
    expect(deleteConnector(load("markers.ecp.json"), unknown as never, 0).reason).toBe(CONNECTION_EDIT_NOT_BINDING)
  })

  it("connectorDeletePreview refuses out-of-range level", () => {
    const doc = executionToReactFlow(load("nested-branch.ecp.json"))
    const edge = doc.edges[0]!
    expect(connectorDeletePreview(load("nested-branch.ecp.json"), edge, 99)).toMatchObject({ ok: false })
  })

  it("connectorDeletePreview accepts parallel level", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          branches: [
            [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
            [{ id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" }],
          ],
        },
      ],
    }
    const doc = executionToReactFlow(base)
    const edge = doc.edges.find((entry) => entry.data.kind === "route" && entry.target === "B")
    expect(edge).toBeDefined()
    expect(connectorDeletePreview(base, edge!, 0).ok).toBe(true)
  })

  it("deleteArm on nested branch detaches only the inner arm", () => {
    const base = load("nested-branch.ecp.json")
    const result = deleteArm(base, "inner", 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.detached?.[0]?.id).toBe("x")
    expect(validate(result.manifest)).toBe(true)
  })

  it("deleteParallelLine splices when two lines remain", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          branches: [
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

  it("attach helpers refuse when detached list is missing", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
    }
    expect(attachAfter(base, "A", "C").reason).toBe(STRUCTURE_EDIT_STEP_NOT_FOUND)
    expect(attachAsArm(base, "A", "C").reason).toBe(STRUCTURE_EDIT_STEP_NOT_FOUND)
    expect(attachAsLine(base, "A", "C").reason).toBe(STRUCTURE_EDIT_STEP_NOT_FOUND)
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

  it("round trip deleteArm then attachAsArm validates", () => {
  // Ajv does not enforce default-arm order (L2).
    const base = load("nested-branch.ecp.json")
    const removed = deleteArm(base, "outer", 0)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    const detachedId = removed.manifest.detached?.[0]?.id
    expect(detachedId).toBeDefined()
    const reattached = attachAsArm(removed.manifest, "outer", detachedId!)
    expect(reattached.ok).toBe(true)
    if (reattached.ok) expect(validate(reattached.manifest)).toBe(true)
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
    const result = deleteConnector(manifest, edge, 0)
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
          type: "branch",
          id: "b",
          branches: [{ expr: "(state) => true", steps: [{ id: "inner", uses: "@executioncontrolprotocol/test.echo", input: { value: "i" }, as: "inner" }] }],
        },
      ],
    }
    expect(attachAfter(base, "inner", "b").reason).toBe(CONNECTION_EDIT_INSIDE)
  })

  it("attachAsArm refuses when target branch is inside the detached root", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "route",
          branches: [{ expr: "(state) => true", steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }] }],
        },
      ],
      detached: [
        {
          type: "branch",
          id: "wrap",
          branches: [
            {
              expr: "(state) => true",
              steps: [
                {
                  type: "branch",
                  id: "inner",
                  branches: [{ expr: "(state) => true", steps: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }] }],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(attachAsArm(base, "inner", "wrap").reason).toBe(CONNECTION_EDIT_INSIDE)
  })

  it("deleteParallelLine refuses bad line index", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "parallel", id: "p", branches: [[{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }]] }],
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
          expr: "(state) => true",
          maxRounds: 1,
          steps: [{ id: "only", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "only" }],
        },
      ],
    }
    expect(deleteSequenceLink(base, "only")).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS })
  })

  it("deleteSequenceLink moves tail inside an arm", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "b",
          branches: [
            {
              expr: "(state) => true",
              steps: [
                { id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" },
                { id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" },
              ],
            },
          ],
        },
      ],
    }
    const result = deleteSequenceLink(base, "B")
    expect(result.ok).toBe(true)
    if (result.ok) {
      const branch = result.manifest.steps[0]!
      expect(branch.type).toBe("branch")
      if (branch.type === "branch") expect(branch.branches[0]!.steps.map((n) => n.id)).toEqual(["A"])
      expect(result.manifest.detached?.map((n) => n.id)).toEqual(["B"])
    }
  })

  it("connectorDeletePreview refuses loop target data edges", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          ref: "state.items",
          maxRounds: 1,
          steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
        },
      ],
    }
    const doc = executionToReactFlow(base)
    const edge = doc.edges.find((entry) => entry.data.kind === "data" && entry.target === "l")
    if (edge) expect(connectorDeletePreview(base, edge, 0)).toMatchObject({ ok: false })
  })

  it("deleteConnector refuses data edge without bindingPath", () => {
    const edge = {
      id: "e",
      source: "w",
      target: "r",
      data: { kind: "data" as const, inputPath: "seed" },
    }
    expect(deleteConnector(load("markers.ecp.json"), edge as never, 0).reason).toBe(CONNECTION_EDIT_NOT_BINDING)
  })

  it("connectorDeletePreview disables loop and expr data edges", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "gated", uses: "@executioncontrolprotocol/test.echo", expr: "(state) => true", input: { value: "x" }, as: "gated" },
        {
          type: "loop",
          id: "retry",
          expr: "(state) => true",
          maxRounds: 2,
          steps: [{ id: "tick", uses: "@executioncontrolprotocol/test.echo", input: { value: "t" }, as: "tick" }],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const loopEdge = doc.edges.find((edge) => edge.data.kind === "route" && edge.data.route === "loop")
    expect(loopEdge).toBeDefined()
    expect(connectorDeletePreview(manifest, loopEdge!, 0)).toMatchObject({ ok: false, reason: CONNECTION_EDIT_LOOP })
    const exprData = doc.edges.find((edge) => edge.data.kind === "data" && edge.targetHandle === "expr")
    if (exprData) expect(connectorDeletePreview(manifest, exprData, 0).ok).toBe(false)
  })

  it("deleteArm on last arm removes the branch when other steps remain", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "b",
          branches: [{ expr: "(state) => true", steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }] }],
        },
        { id: "keep", uses: "@executioncontrolprotocol/test.echo", input: { value: "k" }, as: "keep" },
      ],
    }
    const result = deleteArm(base, "b", 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.steps.map((n) => n.id)).toEqual(["keep"])
      expect(result.manifest.detached?.[0]?.id).toBe("A")
    }
  })

  it("deleteArm refuses when top-level steps would empty", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "only",
          branches: [{ expr: "(state) => true", steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }] }],
        },
      ],
    }
    expect(deleteArm(base, "only", 0)).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS })
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
          type: "branch",
          id: "wrap",
          branches: [{ expr: "(state) => true", steps: [{ id: "inner", uses: "@executioncontrolprotocol/test.echo", input: { value: "i" }, as: "inner" }] }],
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
          type: "branch",
          id: "wrap",
          branches: [{ expr: "(state) => true", steps: [{ id: "inner", uses: "@executioncontrolprotocol/test.echo", input: { value: "i" }, as: "inner" }] }],
        },
      ],
    }
    expect(attachAfter(base, "A", "inner").reason).toBe(STRUCTURE_EDIT_STEP_NOT_FOUND)
  })

  it("deleteConnector deletes a parallel line level", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          branches: [
            [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
            [{ id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" }],
            [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
          ],
        },
      ],
    }
    const doc = executionToReactFlow(base)
    const edge = doc.edges.find(
      (entry) => entry.data.kind === "route" && entry.target === "B" && (entry.data as { route?: string }).route === "parallel",
    )
    expect(edge).toBeDefined()
    const level = (edge!.data as { levels: Array<{ armIndex?: number }> }).levels.findIndex((l) => l.armIndex === 1)
    const result = deleteConnector(base, edge!, level)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const parallel = result.manifest.steps[0]!
      expect(parallel.type).toBe("parallel")
      if (parallel.type === "parallel") expect(parallel.branches).toHaveLength(2)
    }
  })

  it("deleteConnector deletes a sequence link", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" },
        { id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" },
      ],
    }
    const doc = executionToReactFlow(base)
    const edge = doc.edges.find((entry) => entry.data.kind === "route" && entry.target === "B")
    expect(edge).toBeDefined()
    const result = deleteConnector(base, edge!, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest.steps.map((n) => n.id)).toEqual(["A"])
  })

  it("connectorDeletePreview disables Inputs sequence delete", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
    }
    const doc = executionToReactFlow(base)
    const edge = doc.edges.find((entry) => entry.data.kind === "route" && entry.target === "A")
    expect(edge).toBeDefined()
    expect(connectorDeletePreview(base, edge!, 0)).toMatchObject({ ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS })
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
          branches: [
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

  it("attachAsArm appends when every arm is conditional", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "b",
          branches: [
            { expr: "(state) => true", steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }] },
            { expr: "(state) => false", steps: [{ id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" }] },
          ],
        },
      ],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const result = attachAsArm(base, "b", "C")
    expect(result.ok).toBe(true)
    if (result.ok) {
      const branch = result.manifest.steps[0]!
      if (branch.type === "branch") expect(branch.branches[branch.branches.length - 1]!.steps[0]!.id).toBe("C")
    }
  })

  it("deleteArm refuses bad branch or arm index", () => {
    expect(deleteArm(load("nested-branch.ecp.json"), "missing", 0).ok).toBe(false)
    expect(deleteArm(load("nested-branch.ecp.json"), "outer", 9).ok).toBe(false)
  })

  it("attachAsLine appends a parallel line", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          branches: [
            [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
            [{ id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" }],
          ],
        },
      ],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const result = attachAsLine(base, "p", "C")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parallel = result.manifest.steps[0]!
    expect(parallel.type).toBe("parallel")
    if (parallel.type === "parallel") expect(parallel.branches).toHaveLength(3)
    expect(validate(result.manifest)).toBe(true)
  })
})