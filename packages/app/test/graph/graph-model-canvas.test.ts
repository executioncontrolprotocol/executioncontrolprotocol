import type { ExecutionManifest, IfNode, LoopNode, Node, ParallelNode, StepNode } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  addCapabilityStep,
  placementForConnectionOrigin,
  CONNECTION_EDIT_HANDLE,
  CONNECTION_EDIT_NOT_BINDING,
  CONNECTION_EDIT_NOT_STEP,
  CONNECTION_EDIT_ORDER,
  CONNECTION_EDIT_SELF,
  connectInput,
  connectorDeletePreview,
  dataConnectionRefusal,
  deleteConnector,
  deleteSelection,
  executionToReactFlow,
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  isEndNodeSelection,
  LOOP_COUNT_HANDLE,
  LOOP_INDEX_HANDLE,
  LOOP_ITEM_HANDLE,
  LOOP_ITEMS_HANDLE,
  endMarkerId,
  loopIdFromEndMarker,
  portOnDocument,
  removeStructure,
  STRUCTURE_EDIT_DELETE_END,
  STRUCTURE_EDIT_PARALLEL_MIN,
  wrapSteps,
  type AddStepPlacement,
  type ReactFlowEdge,
  type StructureEditResult,
} from "../../src/graph/index.js"
import { EXECUTION_ACCEPTS_NODE_ID, EXECUTION_RETURNS_NODE_ID } from "../../src/graph/io-from-schema.js"
import { locateNode } from "../../src/graph/manifest-walk.js"
import { sourceVisibleTo } from "../../src/graph/read-order.js"

const echo = "@executioncontrolprotocol/test.echo"

function step(id: string, input: Record<string, unknown> = { value: "x" }, extra: Partial<StepNode> = {}): StepNode {
  return { id, uses: echo, input: input as never, as: id, ...extra }
}

function manifestOf(...steps: Node[]): ExecutionManifest {
  return { schema: "@executioncontrolprotocol.execution", version: "2.0", steps }
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

/** A graph with every start node kind: step, if (then and else), parallel, forEach loop with an `end`, and a last step. */
function graph(): ExecutionManifest {
  const base = manifestOf(
    step("src", { value: "a" }),
    {
      type: "if",
      id: "gate",
      expression: "true",
      then: [step("yes", { value: "y" })],
      else: [step("no", { value: "n" })],
    },
    {
      type: "parallel",
      id: "fan",
      paths: [[step("left", { value: "l" })], [step("right", { value: "r" })]],
    },
    {
      type: "loop",
      id: "lp",
      mode: "forEach",
      as: "item",
      input: { items: { $ref: "state.xs" } },
      steps: [step("body", { value: "b" })],
    },
    step("last", { value: "z" }),
  )
  return {
    ...base,
    execution: {
      id: "graph",
      accepts: {
        type: "object",
        properties: { mode: { type: "string" }, doc: { type: "string" }, files: { type: "array" }, xs: { type: "array" } },
      },
    },
  }
}

function connect(
  manifest: ExecutionManifest,
  sourceNodeId: string,
  sourceHandle: string,
  targetStepId: string,
  targetHandle: string,
): StructureEditResult {
  return connectInput(manifest, { sourceNodeId, sourceHandle, targetStepId, targetHandle })
}

describe("drawing a branch into a start node or an end", () => {
  it("binds a step output to an if input", () => {
    const next = ok(connect(graph(), "src", "output", "gate", "mode"))
    expect(node<IfNode>(next, "gate").input).toEqual({ mode: { $ref: "state.src" } })
  })

  it("binds a step field to a parallel input and keeps its other inputs", () => {
    const base = graph()
    node<ParallelNode>(base, "fan").input = { keep: 1 }
    const next = ok(connect(base, "src", "text", "fan", "doc"))
    expect(node<ParallelNode>(next, "fan").input).toEqual({ keep: 1, doc: { $ref: "state.src.text" } })
  })

  it("binds Inputs to an if, a parallel, and the loop driver", () => {
    const base = graph()
    const withIf = ok(connect(base, EXECUTION_ACCEPTS_NODE_ID, "mode", "gate", "mode"))
    expect(node<IfNode>(withIf, "gate").input).toEqual({ mode: { $ref: "state.mode" } })
    const withParallel = ok(connect(base, EXECUTION_ACCEPTS_NODE_ID, "doc", "fan", "doc"))
    expect(node<ParallelNode>(withParallel, "fan").input).toEqual({ doc: { $ref: "state.doc" } })
    const withDriver = ok(connect(base, EXECUTION_ACCEPTS_NODE_ID, "files", "lp", LOOP_ITEMS_HANDLE))
    expect(node<LoopNode>(withDriver, "lp").input).toEqual({ items: { $ref: "state.files" } })
  })


  it("binds a step output to the loop count driver of a for loop", () => {
    const base = manifestOf(step("src"), {
      type: "loop",
      id: "lp",
      mode: "for",
      as: "i",
      input: { count: 1 },
      steps: [step("body", { value: "b" }, { mode: "replace" })],
    })
    const next = ok(connect(base, "src", "output", "lp", LOOP_COUNT_HANDLE))
    expect(node<LoopNode>(next, "lp").input).toEqual({ count: { $ref: "state.src" } })
  })

  it("binds the loop item and index to a body step", () => {
    const base = graph()
    const item = ok(connect(base, "lp", LOOP_ITEM_HANDLE, "body", "value"))
    expect(node<StepNode>(item, "body").input?.value).toEqual({ $ref: "state.item" })
    const index = ok(connect(base, "lp", LOOP_INDEX_HANDLE, "body", "n"))
    expect(node<StepNode>(index, "body").input?.n).toEqual({ $ref: "state.itemIndex" })
  })

  it("binds a for loop index to its own as", () => {
    const base = manifestOf({
      type: "loop",
      id: "lp",
      mode: "for",
      as: "i",
      input: { count: 2 },
      steps: [step("body", { value: "b" }, { mode: "replace" })],
    })
    const next = ok(connect(base, "lp", LOOP_INDEX_HANDLE, "body", "n"))
    expect(node<StepNode>(next, "body").input?.n).toEqual({ $ref: "state.i" })
  })

  it("sets as on an if when drawing from its then side, and uses it", () => {
    const next = ok(connect(graph(), "gate", IF_THEN_HANDLE, "yes", "from"))
    const gate = node<IfNode>(next, "gate")
    expect(gate.as).toBe("gate")
    expect(gate.input).toEqual({})
    expect(node<StepNode>(next, "yes").input?.from).toEqual({ $ref: "state.gate" })
  })

  it("reuses the as an if already has", () => {
    const base = graph()
    const gate = node<IfNode>(base, "gate")
    gate.as = "decision"
    gate.input = { mode: "full" }
    const next = ok(connect(base, "gate", IF_ELSE_HANDLE, "no", "from"))
    expect(node<IfNode>(next, "gate").as).toBe("decision")
    expect(node<IfNode>(next, "gate").input).toEqual({ mode: "full" })
    expect(node<StepNode>(next, "no").input?.from).toEqual({ $ref: "state.decision" })
  })

  it("sets as on a parallel when drawing from a path port", () => {
    const next = ok(connect(graph(), "fan", "path-1", "left", "from"))
    const fan = node<ParallelNode>(next, "fan")
    expect(fan.as).toBe("fan")
    expect(fan.input).toEqual({})
    expect(node<StepNode>(next, "left").input?.from).toEqual({ $ref: "state.fan" })
  })

  it("does not change the manifest it is given", () => {
    const base = graph()
    const before = JSON.stringify(base)
    ok(connect(base, "gate", IF_THEN_HANDLE, "yes", "from"))
    expect(JSON.stringify(base)).toBe(before)
  })

  describe("refusals", () => {
    it("refuses a branch from a node into itself", () => {
      expect(refusal(connect(graph(), "gate", IF_THEN_HANDLE, "gate", "x"))).toBe(CONNECTION_EDIT_SELF)
    })

    it("refuses the returns pseudo-node and a retired loop port", () => {
      expect(refusal(connect(graph(), "src", "output", EXECUTION_RETURNS_NODE_ID, "x"))).toBe(CONNECTION_EDIT_HANDLE)
      expect(refusal(connect(graph(), "src", "output", "lp", "ref"))).toBe(CONNECTION_EDIT_HANDLE)
    })

    it("refuses a loop driver port the mode does not have", () => {
      expect(refusal(connect(graph(), "src", "output", "lp", LOOP_COUNT_HANDLE))).toBe(CONNECTION_EDIT_HANDLE)
      const forLoop = manifestOf(step("src"), {
        type: "loop",
        id: "w",
        mode: "for",
        as: "i",
        input: { count: 2 },
        steps: [step("body", { value: "b" }, { mode: "replace" })],
      })
      expect(refusal(connect(forLoop, "src", "output", "w", LOOP_ITEMS_HANDLE))).toBe(CONNECTION_EDIT_HANDLE)
    })

    it("refuses a reader that runs before the writer", () => {
      expect(refusal(connect(graph(), "last", "output", "gate", "x"))).toBe(CONNECTION_EDIT_ORDER)
      expect(refusal(connect(graph(), "last", "output", "src", "x"))).toBe(CONNECTION_EDIT_ORDER)
      expect(refusal(connect(graph(), "last", "output", "lp", LOOP_ITEMS_HANDLE))).toBe(CONNECTION_EDIT_ORDER)
    })

    it("refuses a then or else port outside its side", () => {
      expect(refusal(connect(graph(), "gate", IF_THEN_HANDLE, "last", "x"))).toBe(CONNECTION_EDIT_ORDER)
      expect(refusal(connect(graph(), "gate", IF_THEN_HANDLE, "no", "x"))).toBe(CONNECTION_EDIT_ORDER)
      expect(refusal(connect(graph(), "gate", IF_ELSE_HANDLE, "yes", "x"))).toBe(CONNECTION_EDIT_ORDER)
    })

    it("refuses a path port outside its path and inside a sibling path", () => {
      expect(refusal(connect(graph(), "fan", "path-1", "last", "x"))).toBe(CONNECTION_EDIT_ORDER)
      expect(refusal(connect(graph(), "fan", "path-1", "right", "x"))).toBe(CONNECTION_EDIT_ORDER)
    })

    it("refuses the item port outside the loop", () => {
      expect(refusal(connect(graph(), "lp", LOOP_ITEM_HANDLE, "last", "x"))).toBe(CONNECTION_EDIT_ORDER)
    })

    it("refuses a port the source does not have", () => {
      expect(connect(graph(), "gate", "elsewhere", "yes", "x").ok).toBe(false)
      expect(connect(graph(), "fan", "output", "left", "x").ok).toBe(false)
      expect(connect(graph(), "fan", "path-9", "left", "x").ok).toBe(false)
    })

    it("refuses a loop item port when the loop has no as", () => {
      const base = graph()
      delete node<LoopNode>(base, "lp").as
      expect(refusal(connect(base, "lp", LOOP_ITEM_HANDLE, "body", "x"))).toBe(CONNECTION_EDIT_HANDLE)
    })

    it("refuses a missing target", () => {
      expect(connect(graph(), "src", "output", "ghost", "x").ok).toBe(false)
    })

    it("allows a step after a forEach loop to read the body output", () => {
      const result = connect(graph(), "body", "output", "last", "x")
      expect(result.ok).toBe(true)
    })
  })
})

describe("read order for start nodes and ends", () => {
  const visible = (manifest: ExecutionManifest, nodeId: string, handleId: string, reader: string): boolean =>
    sourceVisibleTo(manifest, { nodeId, handleId }, reader)

  it("a step is readable by the nodes after it", () => {
    const base = graph()
    for (const reader of ["gate", "fan", "lp", endMarkerId("lp", "loop"), "last"]) {
      expect(visible(base, "src", "output", reader)).toBe(true)
    }
  })

  it("a step is not readable by the nodes before it", () => {
    const base = graph()
    for (const reader of ["src", "gate", "fan", "lp", endMarkerId("lp", "loop")]) {
      expect(visible(base, "last", "output", reader)).toBe(false)
    }
  })

  it("a then step is readable by the else side only when it is not a sibling branch", () => {
    const base = graph()
    expect(visible(base, "yes", "output", "no")).toBe(false)
    expect(visible(base, "yes", "output", "last")).toBe(true)
  })

  it("the item port is readable inside the loop body but not after it", () => {
    const base = graph()
    expect(visible(base, "lp", LOOP_ITEM_HANDLE, "body")).toBe(true)
    expect(visible(base, "lp", LOOP_ITEM_HANDLE, "last")).toBe(false)
  })

  it("Inputs are readable by every node", () => {
    const base = graph()
    for (const reader of ["src", "gate", "yes", "fan", "lp", "body", endMarkerId("lp", "loop"), "last"]) {
      expect(visible(base, EXECUTION_ACCEPTS_NODE_ID, "mode", reader)).toBe(true)
    }
  })

  it("a node that is not in the manifest reads nothing", () => {
    expect(visible(graph(), "src", "output", "ghost")).toBe(false)
  })
})

describe("deleting a branch", () => {
  function edgeTo(manifest: ExecutionManifest, target: string, handle: string): ReactFlowEdge {
    const doc = executionToReactFlow(manifest)
    const edge = doc.edges.find((entry) => entry.target === target && entry.targetHandle === handle)
    if (!edge) throw new Error(`no branch into ${target}/${handle}`)
    return edge
  }

  it.each([
    ["an if input", "gate", "mode"],
    ["a parallel input", "fan", "doc"],
    ["the loop driver", "lp", LOOP_ITEMS_HANDLE],
  ])("removes the $ref into %s", (_label, target, handle) => {
    const driverBase: ExecutionManifest = {
      ...manifestOf(
        step("src", { value: "a" }),
        {
          type: "loop",
          id: "lp",
          mode: "forEach",
          as: "item",
          input: {},
          steps: [step("body", { value: "b" })],
        },
        step("last", { value: "z" }),
      ),
      execution: {
        accepts: {
          type: "object",
          properties: { files: { type: "array" } },
        },
      },
    }
    const drawn = ok(
      target === "lp"
        ? connect(driverBase, EXECUTION_ACCEPTS_NODE_ID, "files", target, handle)
        : connect(graph(), "src", "output", target, handle),
    )
    const edge = edgeTo(drawn, target, handle)
    expect(connectorDeletePreview(drawn, edge).ok).toBe(true)
    const removed = ok(deleteConnector(drawn, edge))
    const holder = node<IfNode | ParallelNode | LoopNode>(removed, target)
    const key = target === "lp" ? "items" : handle
    if (target === "lp") {
      expect((holder as { input?: Record<string, unknown> }).input?.items).toBeUndefined()
    } else {
      expect((holder as { input?: Record<string, unknown> }).input?.[key]).toBeUndefined()
    }
    expect(deleteSelection(drawn, { kind: "connector", edge }, false)).toMatchObject({ ok: true })
  })

  it("keeps the rest of the manifest and the other inputs", () => {
    const base = graph()
    node<IfNode>(base, "gate").input = { a: { $ref: "state.src" }, b: { $ref: "state.src" } }
    const edge = edgeTo(base, "gate", "a")
    const removed = ok(deleteConnector(base, edge))
    expect(node<IfNode>(removed, "gate").input).toEqual({ b: { $ref: "state.src" } })
    expect(removed.steps.map((entry) => entry.id)).toEqual(base.steps.map((entry) => entry.id))
  })

  it("refuses an edge that is not a branch with a reference", () => {
    const edge: ReactFlowEdge = {
      id: "e",
      source: "src",
      target: "gate",
      targetHandle: "mode",
      data: { kind: "data", inputPath: "mode" },
    }
    expect(deleteConnector(graph(), edge)).toMatchObject({ ok: false, reason: CONNECTION_EDIT_NOT_BINDING })
    expect(connectorDeletePreview(graph(), edge)).toMatchObject({ ok: false })
  })
})

describe("deleting a start node and an end", () => {
  const ids = (nodes: readonly Node[]): string[] => nodes.map((entry) => (entry as { id: string }).id)

  it("deleting an if keeps its then nodes, then its else nodes, in place", () => {
    const next = ok(deleteSelection(graph(), { kind: "structure", structureId: "gate" }, false)!)
    expect(ids(next.steps)).toEqual(["src", "yes", "no", "fan", "lp", "last"])
  })

  it("deleting an if without an else keeps its then nodes", () => {
    const base = manifestOf(step("a"), { type: "if", id: "gate", expression: "true", then: [step("t1"), step("t2")] }, step("z"))
    const next = ok(deleteSelection(base, { kind: "structure", structureId: "gate" }, false)!)
    expect(ids(next.steps)).toEqual(["a", "t1", "t2", "z"])
  })

  it("deleting a parallel keeps every path in order", () => {
    const next = ok(deleteSelection(graph(), { kind: "structure", structureId: "fan" }, false)!)
    expect(ids(next.steps)).toEqual(["src", "gate", "left", "right", "lp", "last"])
  })

  it("deleting a loop keeps its body", () => {
    const next = ok(deleteSelection(graph(), { kind: "structure", structureId: "lp" }, false)!)
    expect(ids(next.steps)).toEqual(["src", "gate", "fan", "body", "last"])
  })

  it("deleting a nested start node splices into its parent", () => {
    const base = manifestOf({
      type: "if",
      id: "outer",
      expression: "true",
      then: [
        step("first"),
        { type: "loop", id: "inner", mode: "for", as: "i", input: { count: 2 }, steps: [step("deep", { value: "d" }, { mode: "replace" })] },
      ],
    })
    const next = ok(deleteSelection(base, { kind: "structure", structureId: "inner" }, false)!)
    expect(ids((next.steps[0] as IfNode).then)).toEqual(["first", "deep"])
  })

  it("delete with its nodes removes the start node and everything inside it", () => {
    for (const [id, remaining] of [
      ["gate", ["src", "fan", "lp", "last"]],
      ["fan", ["src", "gate", "lp", "last"]],
      ["lp", ["src", "gate", "fan", "last"]],
    ] as const) {
      expect(ids(ok(removeStructure(graph(), id)).steps)).toEqual(remaining)
    }
  })

  it("refuses to delete a loop end and says why", () => {
    const endId = endMarkerId("lp", "loop")
    expect(deleteSelection(graph(), { kind: "end", endNodeId: endId }, false)).toMatchObject({
      ok: false,
      reason: STRUCTURE_EDIT_DELETE_END,
    })
    expect(STRUCTURE_EDIT_DELETE_END).toBe("Delete the control node instead")
  })

  it("does nothing while a run is shown", () => {
    expect(deleteSelection(graph(), { kind: "structure", structureId: "gate" }, true)).toBeUndefined()
    expect(deleteSelection(graph(), { kind: "none" }, false)).toBeUndefined()
  })

  it("tells control end nodes from other ids", () => {
    const base = graph()
    expect(isEndNodeSelection(base, endMarkerId("lp", "loop"))).toBe(true)
    expect(isEndNodeSelection(base, endMarkerId("gate", "then"))).toBe(true)
    expect(isEndNodeSelection(base, "lp")).toBe(false)
    expect(isEndNodeSelection(base, "ghost")).toBe(false)
    expect(loopIdFromEndMarker(endMarkerId("lp", "loop"))).toBe("lp")
    expect(loopIdFromEndMarker("lp")).toBeUndefined()
  })
})

describe("wrapping nodes", () => {
  it("wraps one step in an if, a parallel (refused) and a loop", () => {
    const base = graph()
    expect(ok(wrapSteps(base, ["src"], "if")).steps[0]).toMatchObject({ type: "if" })
    expect(ok(wrapSteps(base, ["src"], "loop")).steps[0]).toMatchObject({ type: "loop", mode: "for" })
    expect(refusal(wrapSteps(base, ["src"], "parallel"))).toBe(STRUCTURE_EDIT_PARALLEL_MIN)
    expect(STRUCTURE_EDIT_PARALLEL_MIN).toBe("Select two or more nodes, one per path")
  })

  it("wraps two siblings in each kind", () => {
    const base = manifestOf(step("a"), step("b"), step("c"))
    const asParallel = ok(wrapSteps(base, ["a", "b"], "parallel"))
    expect((asParallel.steps[0] as ParallelNode).paths).toHaveLength(2)
    expect(ok(wrapSteps(base, ["a", "b"], "if")).steps[0]).toMatchObject({ type: "if" })
    expect((ok(wrapSteps(base, ["a", "b"], "loop")).steps[0] as LoopNode).steps).toHaveLength(2)
  })

  it("wraps a start node with its siblings", () => {
    const wrapped = ok(wrapSteps(graph(), ["gate", "fan"], "parallel"))
    expect((wrapped.steps[1] as ParallelNode).paths.map((path) => (path[0] as { id: string }).id)).toEqual(["gate", "fan"])
  })

  it("wraps a nested loop in an if", () => {
    const wrapped = ok(wrapSteps(graph(), ["lp"], "if"))
    expect(node<IfNode>(wrapped, wrapped.steps[3] ? (wrapped.steps[3] as { id: string }).id : "").type).toBe("if")
  })
})

describe("adding a node", () => {
  const stepIdsOf = (nodes: readonly Node[]): string[] => nodes.map((entry) => (entry as { id: string }).id)

  function add(manifest: ExecutionManifest, placement: AddStepPlacement): { manifest: ExecutionManifest; stepId: string } {
    const result = addCapabilityStep(manifest, { id: echo }, placement)
    if (!result.ok) throw new Error(result.reason)
    return { manifest: result.manifest, stepId: result.stepId }
  }

  it("adds at the start of the then side and of the else side", () => {
    const thenSide = add(graph(), { kind: "then-side", ifId: "gate" })
    expect(stepIdsOf(node<IfNode>(thenSide.manifest, "gate").then)[0]).toBe(thenSide.stepId)
    expect(node<IfNode>(thenSide.manifest, "gate").then).toHaveLength(2)
    const elseSide = add(graph(), { kind: "else-side", ifId: "gate" })
    expect(stepIdsOf(node<IfNode>(elseSide.manifest, "gate").else ?? [])[0]).toBe(elseSide.stepId)
  })

  it("creates the else side when the if has none", () => {
    const base = manifestOf({ type: "if", id: "gate", expression: "true", then: [step("t")] })
    const added = add(base, { kind: "else-side", ifId: "gate" })
    expect(node<IfNode>(added.manifest, "gate").else).toHaveLength(1)
  })

  it("adds at the start of path N and leaves the other paths alone", () => {
    const added = add(graph(), { kind: "path-side", parallelId: "fan", pathIndex: 1 })
    const fan = node<ParallelNode>(added.manifest, "fan")
    expect(stepIdsOf(fan.paths[1]!)[0]).toBe(added.stepId)
    expect(stepIdsOf(fan.paths[1]!)).toHaveLength(2)
    expect(stepIdsOf(fan.paths[0]!)).toEqual(["left"])
  })

  it("refuses a path that does not exist", () => {
    const result = addCapabilityStep(graph(), { id: echo }, { kind: "path-side", parallelId: "fan", pathIndex: 5 })
    expect(result.ok).toBe(false)
  })

  it("adds at the start of the loop body", () => {
    const added = add(graph(), { kind: "loop-body", loopId: "lp" })
    expect(stepIdsOf(node<LoopNode>(added.manifest, "lp").steps)[0]).toBe(added.stepId)
  })

  it("adds a new path", () => {
    const added = add(graph(), { kind: "new-path", parallelId: "fan" })
    const fan = node<ParallelNode>(added.manifest, "fan")
    expect(fan.paths).toHaveLength(3)
    expect(stepIdsOf(fan.paths[2]!)).toEqual([added.stepId])
  })

  it("sets replace on a step added to a side or path inside a for loop, and not outside one", () => {
    const base = manifestOf({
      type: "loop",
      id: "w",
      mode: "for",
      as: "i",
      input: { count: 2 },
      steps: [
        { type: "if", id: "inner", expression: "true", then: [step("t", { value: "t" }, { mode: "replace" })] },
        { type: "parallel", id: "par", paths: [[step("p", { value: "p" }, { mode: "replace" })]] },
      ],
    })
    const onThen = add(base, { kind: "then-side", ifId: "inner" })
    expect(node<StepNode>(onThen.manifest, onThen.stepId).mode).toBe("replace")
    const onPath = add(base, { kind: "path-side", parallelId: "par", pathIndex: 0 })
    expect(node<StepNode>(onPath.manifest, onPath.stepId).mode).toBe("replace")
    const outside = add(graph(), { kind: "then-side", ifId: "gate" })
    expect(node<StepNode>(outside.manifest, outside.stepId).mode).toBeUndefined()
    const inForEach = add(graph(), { kind: "loop-body", loopId: "lp" })
    expect(node<StepNode>(inForEach.manifest, inForEach.stepId).mode).toBeUndefined()
  })
})

describe("ports of start nodes and ends on the document", () => {
  it("finds the ports of an if, a parallel and an end", () => {
    const doc = executionToReactFlow(graph())
    expect(portOnDocument(doc, "gate", IF_THEN_HANDLE, "output")?.id).toBe(IF_THEN_HANDLE)
    expect(portOnDocument(doc, "gate", IF_ELSE_HANDLE, "output")?.id).toBe(IF_ELSE_HANDLE)
    expect(portOnDocument(doc, "fan", "path-1", "output")?.id).toBe("path-1")
    expect(portOnDocument(doc, endMarkerId("lp", "loop"), "value", "input")).toBeUndefined()
    expect(portOnDocument(doc, "lp", LOOP_ITEMS_HANDLE, "input")?.id).toBe(LOOP_ITEMS_HANDLE)
  })

  it("finds if and parallel input ports declared by accepts", () => {
    const base = graph()
    node<IfNode>(base, "gate").accepts = { type: "object", properties: { mode: { type: "string" } } }
    node<ParallelNode>(base, "fan").accepts = { type: "object", properties: { doc: { type: "string" } } }
    const doc = executionToReactFlow(base)
    expect(portOnDocument(doc, "gate", "mode", "input")?.id).toBe("mode")
    expect(portOnDocument(doc, "fan", "doc", "input")?.id).toBe("doc")
  })

  it("keeps loop end nodes on the canvas without data ports", () => {
    const doc = executionToReactFlow(graph())
    const end = doc.nodes.find((node) => node.id === endMarkerId("lp", "loop"))
    expect(end?.type).toBe("ecp-end")
    expect(portOnDocument(doc, endMarkerId("lp", "loop"), "value", "input")).toBeUndefined()
    expect(portOnDocument(doc, endMarkerId("lp", "loop"), "repeat", "input")).toBeUndefined()
  })

  it("does not find a port the node does not have", () => {
    const doc = executionToReactFlow(graph())
    expect(portOnDocument(doc, "gate", "nope", "input")).toBeUndefined()
    expect(portOnDocument(doc, "ghost", "x", "input")).toBeUndefined()
  })

  it("accepts a branch into an if, a parallel and an end, and refuses the wrong ones", () => {
    const base = graph()
    node<IfNode>(base, "gate").accepts = { type: "object", properties: { mode: {} } }
    const doc = executionToReactFlow(base)
    const refusalOf = (source: string, sourceHandle: string, target: string, targetHandle: string): string | undefined =>
      dataConnectionRefusal(base, doc, { source, target, sourceHandle, targetHandle })
    expect(refusalOf("src", "output", "gate", "mode")).toBeUndefined()
    expect(refusalOf("body", "output", endMarkerId("lp", "loop"), "value")).toBe(CONNECTION_EDIT_HANDLE)
    expect(refusalOf("last", "output", "gate", "mode")).toBe(CONNECTION_EDIT_ORDER)
    expect(refusalOf("src", "output", "gate", "nope")).toBe(CONNECTION_EDIT_HANDLE)
    expect(refusalOf("gate", IF_THEN_HANDLE, "gate", "mode")).toBe(CONNECTION_EDIT_SELF)
  })

  it("refuses a branch into a disconnected start node", () => {
    const base: ExecutionManifest = {
      ...manifestOf(step("src")),
      detached: [{ type: "if", id: "loose", expression: "true", then: [step("t")], accepts: { type: "object", properties: { a: {} } } }],
    }
    const doc = executionToReactFlow(base)
    expect(
      dataConnectionRefusal(base, doc, { source: "src", target: "loose", sourceHandle: "output", targetHandle: "a" }),
    ).toBe(CONNECTION_EDIT_NOT_STEP)
  })
})

describe("where a node dropped from a port goes", () => {
  const origin = (nodeId: string, handleId: string, side: "output" | "input" = "output") => ({ nodeId, handleId, side })

  it("Inputs output goes before the first node", () => {
    expect(placementForConnectionOrigin(graph(), origin(EXECUTION_ACCEPTS_NODE_ID, "mode"))).toEqual({ kind: "before", nodeId: "src" })
    expect(placementForConnectionOrigin({ ...graph(), steps: [] }, origin(EXECUTION_ACCEPTS_NODE_ID, "mode"))).toEqual({ kind: "top" })
  })

  it("an if then or else port goes into that side", () => {
    expect(placementForConnectionOrigin(graph(), origin("gate", IF_THEN_HANDLE))).toEqual({ kind: "then-side", ifId: "gate" })
    expect(placementForConnectionOrigin(graph(), origin("gate", IF_ELSE_HANDLE))).toEqual({ kind: "else-side", ifId: "gate" })
  })

  it("a path port goes into that path, and an unknown path falls back to after the node", () => {
    expect(placementForConnectionOrigin(graph(), origin("fan", "path-2"))).toEqual({
      kind: "path-side",
      parallelId: "fan",
      pathIndex: 1,
    })
    expect(placementForConnectionOrigin(graph(), origin("fan", "path-9"))).toEqual({ kind: "after", nodeId: "fan" })
  })

  it("a loop item or index port goes before the first body node, or into an empty body", () => {
    expect(placementForConnectionOrigin(graph(), origin("lp", LOOP_ITEM_HANDLE))).toEqual({ kind: "before", nodeId: "body" })
    const empty = graph()
    node<LoopNode>(empty, "lp").steps = []
    expect(placementForConnectionOrigin(empty, origin("lp", LOOP_INDEX_HANDLE))).toEqual({ kind: "loop-body", loopId: "lp" })
  })

  it("a step goes after its output and before its input", () => {
    expect(placementForConnectionOrigin(graph(), origin("src", "output"))).toEqual({ kind: "after", nodeId: "src" })
    expect(placementForConnectionOrigin(graph(), origin("last", "value", "input"))).toEqual({ kind: "before", nodeId: "last" })
  })

  it("an input port of a start node goes before that node", () => {
    expect(placementForConnectionOrigin(graph(), origin("gate", "mode", "input"))).toEqual({ kind: "before", nodeId: "gate" })
  })
})
