import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  addCapabilityStep,
  connectInput,
  connectInputTarget,
  dataConnectionRefusal,
  executionToReactFlow,
  isValidDataConnection,
  loopEndNodeId,
  setLoopField,
  unwrapStructure,
  wrapSteps,
  EMPTY_INPUT_PORT_ID,
  LOOP_ITEM_HANDLE,
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  LOOP_COUNT_HANDLE,
  LOOP_INDEX_HANDLE,
} from "../../src/graph/index.js"
import { validateExecution } from "@executioncontrolprotocol/engine"

const echo = "@executioncontrolprotocol/test.echo"

describe("graph model encoder branches", () => {
  it("if without else still exposes then port only on the taken side list", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "gate",
          expression: "true",
          then: [{ id: "yes", uses: echo, input: { value: "y" }, as: "yes" }],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const gate = doc.nodes.find((n) => n.id === "gate")
    expect(gate?.type).toBe("ecp-if")
    const outputs = (gate!.data as { outputs: Array<{ id: string }> }).outputs.map((p) => p.id)
    expect(outputs).toContain(IF_THEN_HANDLE)
    expect(outputs).toContain(IF_ELSE_HANDLE)
    expect(doc.edges.every((e) => e.data.kind === "data")).toBe(true)
  })

  it("parallel without accepts still gets path ports", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "fan",
          paths: [
            [{ id: "a", uses: echo, input: { value: "a" }, as: "a" }],
            [{ id: "b", uses: echo, input: { value: "b" }, as: "b" }],
          ],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const fan = doc.nodes.find((n) => n.id === "fan")
    const outputs = (fan!.data as { outputs: Array<{ id: string }> }).outputs
    expect(outputs.some((p) => p.id.startsWith("path-"))).toBe(true)
    expect((fan!.data as { inputs: Array<{ id: string }> }).inputs.map((port) => port.id)).toEqual([EMPTY_INPUT_PORT_ID])
  })

  it("for loop after step can read the last body commit", () => {
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
          steps: [{ id: "S", uses: echo, input: { value: { $ref: "state.i" } }, as: "S", mode: "replace" }],
        },
        { id: "after", uses: echo, input: { x: { $ref: "state.S" } }, as: "after" },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const edge = doc.edges.find((e) => e.source === "S" && e.target === "after")
    expect(edge?.targetHandle).toBe("x")
  })

  it("forEach loop without as has no item ports", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "W",
          mode: "forEach",
          input: { items: { $ref: "state.items" } },
          steps: [{ id: "S", uses: echo, input: { value: "x" } }],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const loop = doc.nodes.find((n) => n.id === "W")
    const data = loop!.data as { outputs: Array<{ id: string }> }
    expect(data.outputs.some((p) => p.id === LOOP_INDEX_HANDLE)).toBe(false)
    expect(data.outputs.some((p) => p.id === LOOP_ITEM_HANDLE)).toBe(false)
  })

  it("for mode exposes count input port", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "F",
          mode: "for",
          as: "i",
          input: { count: 3 },
          steps: [],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const loop = doc.nodes.find((n) => n.id === "F")!
    const inputs = (loop.data as { inputs: Array<{ id: string }> }).inputs
    expect(inputs.some((p) => p.id === LOOP_COUNT_HANDLE)).toBe(true)
  })
})

describe("structure-edit and data-connect branches", () => {
  it("wrapSteps refuses parallel wrap for a single step", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: echo, input: { value: "a" } }],
    }
    expect(wrapSteps(base, ["A"], "parallel")).toMatchObject({ ok: false })
  })

  it("setLoopField rejects changing mode to an invalid value", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "L",
          mode: "for",
          as: "i",
          input: { count: 1 },
          steps: [],
        },
      ],
    }
    expect(setLoopField(base, "L", "concurrency", 2)).toMatchObject({ ok: false })
  })

  it("unwrapStructure splices if without else", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          then: [{ id: "only", uses: echo, input: { value: "o" } }],
        },
      ],
    }
    const result = unwrapStructure(manifest, "g")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest.steps[0]?.id).toBe("only")
  })

  it("dataConnectionRefusal reports incompatible ports", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "w", uses: echo, input: { value: "w" }, as: "w" },
        { id: "t", uses: echo, as: "t" },
      ],
    }
    const doc = executionToReactFlow(manifest, {
      capabilitySchemas: {
        [echo]: {
          accepts: { type: "object", properties: { value: { type: "string" } } },
          returns: { type: "object", properties: { echo: { type: "string" } } },
        },
      },
    })
    const bad = {
      source: "w",
      target: "t",
      sourceHandle: "missing",
      targetHandle: "value",
    }
    expect(isValidDataConnection(manifest, doc, bad)).toBe(false)
    expect(dataConnectionRefusal(manifest, doc, bad)).toBeDefined()
  })

  it("addCapabilityStep on then-side allocates as when missing", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          then: [],
        },
      ],
    }
    const added = addCapabilityStep(manifest, { id: echo }, { kind: "then-side", ifId: "g" })
    expect(added.ok).toBe(true)
    if (added.ok) {
      const ifNode = added.manifest.steps[0]
      if (ifNode.type === "if") {
        const step = ifNode.then[0] as { as?: string }
        expect(step.as).toBeDefined()
      }
    }
  })

  it("connectInput refuses wiring to returns pseudo-node", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "w", uses: echo, input: { value: "w" }, as: "w" }],
    }
    expect(
      connectInput(manifest, {
        sourceNodeId: "w",
        sourceHandle: "output",
        targetStepId: "ecp:returns",
        targetHandle: "value",
      }),
    ).toMatchObject({ ok: false })
  })
})

describe("add-step placement branches", () => {
  it("adds a step on a new parallel path", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [{ id: "a", uses: echo, input: { value: "a" } }],
            [{ id: "b", uses: echo, input: { value: "b" } }],
          ],
        },
      ],
    }
    const added = addCapabilityStep(manifest, { id: echo }, { kind: "new-path", parallelId: "p" })
    expect(added.ok).toBe(true)
    if (added.ok) {
      const par = added.manifest.steps[0]
      if (par.type === "parallel") expect(par.paths).toHaveLength(3)
    }
  })

  it("inserts before and after siblings", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "A", uses: echo, input: { value: "a" } },
        { id: "B", uses: echo, input: { value: "b" } },
      ],
    }
    const before = addCapabilityStep(manifest, { id: echo }, { kind: "before", nodeId: "B" })
    const after = addCapabilityStep(manifest, { id: echo }, { kind: "after", nodeId: "A" })
    expect(before.ok && after.ok).toBe(true)
    if (before.ok) expect(before.manifest.steps.map((s) => s.id)).toContain(before.stepId)
    if (after.ok) expect(after.manifest.steps.map((s) => s.id)).toContain(after.stepId)
  })
})

describe("data-connect helpers", () => {
  it("connectInputTarget drops incomplete connections", () => {
    expect(connectInputTarget({ source: "a", target: "b" })).toBeUndefined()
    expect(
      connectInputTarget({ source: "a", target: "b", sourceHandle: "out", targetHandle: "in" }),
    ).toEqual({ sourceNodeId: "a", sourceHandle: "out", targetStepId: "b", targetHandle: "in" })
  })

  it("if script condition encodes without extra badges", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "s",
          script: { source: "return state.ok", lang: "js" },
          then: [{ id: "y", uses: echo, input: { value: "y" } }],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const gate = doc.nodes.find((n) => n.id === "s")
    expect(gate?.type).toBe("ecp-if")
    expect((gate!.data as { expression?: string }).expression).toBeUndefined()
  })
})

describe("end and parallel encoder branches", () => {
  it("loop end node is a shell without data ports", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "L",
          mode: "for",
          as: "i",
          input: { count: 1 },
          steps: [],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const end = doc.nodes.find((n) => n.id === loopEndNodeId("L"))
    expect(end?.type).toBe("ecp-end")
    const data = end!.data as { label: string; structureKind: string }
    expect(data.label).toBe("end loop")
    expect(data.structureKind).toBe("loop")
  })

  it("parallel with accepts and as draws input ports", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "fan",
          accepts: { type: "object", properties: { q: { type: "string" } } },
          input: { q: { $ref: "state.q" } },
          as: "query",
          paths: [
            [{ id: "a", uses: echo, input: { value: { $ref: "state.query.q" } }, as: "a" }],
            [{ id: "b", uses: echo, input: { value: "b" }, as: "b" }],
          ],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const fan = doc.nodes.find((n) => n.id === "fan")
    const inputs = (fan!.data as { inputs: Array<{ id: string }> }).inputs
    expect(inputs.some((p) => p.id === "q")).toBe(true)
  })
})

describe("validate graph model rules", () => {
  it("rejects if with empty then", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", then: [] }],
    }
    const validation = await validateExecution(manifest, { capabilities: [] })
    expect(validation.issues.some((i) => i.path.includes("/then"))).toBe(true)
  })
})