import type { Connection } from "@xyflow/react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  EXECUTION_ACCEPTS_NODE_ID,
  executionToReactFlow,
  FLOW_IN_HANDLE,
  FLOW_OUT_HANDLE,
  isValidManifestFlowConnection,
  resolveFlowConnect,
} from "../../src/graph/index.js"

function connect(source: string, target: string): Connection {
  return { source, target, sourceHandle: FLOW_OUT_HANDLE, targetHandle: FLOW_IN_HANDLE }
}

describe("flow-connect", () => {
  it("returns undefined for wrong handles or missing endpoints", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const doc = executionToReactFlow(manifest)
    expect(resolveFlowConnect(manifest, doc, { source: "A", target: "C", sourceHandle: "data", targetHandle: FLOW_IN_HANDLE })).toBeUndefined()
    expect(resolveFlowConnect(manifest, doc, connect("", "C"))).toBeUndefined()
    expect(isValidManifestFlowConnection(manifest, doc, connect("A", "C"))).toBe(true)
  })

  it("attachAfter from accepts and from a step onto detached root", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const doc = executionToReactFlow(manifest)
    expect(resolveFlowConnect(manifest, doc, connect(EXECUTION_ACCEPTS_NODE_ID, "C"))).toEqual({
      kind: "attachAfter",
      sourceId: EXECUTION_ACCEPTS_NODE_ID,
      detachedId: "C",
    })
    expect(resolveFlowConnect(manifest, doc, connect("A", "C"))).toEqual({
      kind: "attachAfter",
      sourceId: "A",
      detachedId: "C",
    })
  })

  it("resolves detached frame flow-in to the detached structure root", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
      detached: [
        {
          type: "branch",
          id: "b",
          branches: [{ expr: "(state) => true", steps: [{ id: "D", uses: "@executioncontrolprotocol/test.echo", input: { value: "d" }, as: "D" }] }],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const frame = doc.nodes.find((node) => node.type === "ecp-frame" && node.id.includes("b"))
    expect(frame).toBeDefined()
    const action = resolveFlowConnect(manifest, doc, connect("A", frame!.id))
    expect(action).toEqual({ kind: "attachAfter", sourceId: "A", detachedId: "b" })
  })

  it("attachAsArm when dragging detached root onto in-flow branch frame", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "route",
          branches: [{ expr: "(state) => true", steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }] }],
        },
      ],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const doc = executionToReactFlow(manifest)
    const frame = doc.nodes.find((node) => node.type === "ecp-frame" && (node.data as { structureId?: string }).structureId === "route")
    expect(frame).toBeDefined()
    expect(resolveFlowConnect(manifest, doc, connect("C", frame!.id))).toEqual({
      kind: "attachAsArm",
      branchId: "route",
      detachedId: "C",
    })
  })

  it("attachAsLine when dragging detached root onto in-flow parallel frame", () => {
    const manifest: ExecutionManifest = {
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
    const doc = executionToReactFlow(manifest)
    const frame = doc.nodes.find((node) => node.type === "ecp-frame" && (node.data as { structureId?: string }).structureId === "p")
    expect(frame).toBeDefined()
    expect(resolveFlowConnect(manifest, doc, connect("C", frame!.id))).toEqual({
      kind: "attachAsLine",
      parallelId: "p",
      detachedId: "C",
    })
  })

  it("rejects connecting detached onto detached branch frame", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }],
      detached: [
        { id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" },
        {
          type: "branch",
          id: "b",
          branches: [{ expr: "(state) => true", steps: [{ id: "D", uses: "@executioncontrolprotocol/test.echo", input: { value: "d" }, as: "D" }] }],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const frame = doc.nodes.find(
      (node) =>
        node.type === "ecp-frame" &&
        (node.data as { structureId?: string; detached?: boolean }).structureId === "b" &&
        (node.data as { detached?: boolean }).detached,
    )
    expect(frame).toBeDefined()
    expect(resolveFlowConnect(manifest, doc, connect("C", frame!.id))).toBeUndefined()
  })

  it("attachAsArm via in-flow structure id when target is the branch node", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "route",
          branches: [{ expr: "(state) => true", steps: [{ id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" }] }],
        },
      ],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const doc = executionToReactFlow(manifest)
    expect(resolveFlowConnect(manifest, doc, connect("C", "route"))).toEqual({
      kind: "attachAsArm",
      branchId: "route",
      detachedId: "C",
    })
  })

  it("attachAsLine via in-flow parallel structure id", () => {
    const manifest: ExecutionManifest = {
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
    const doc = executionToReactFlow(manifest)
    expect(resolveFlowConnect(manifest, doc, connect("C", "p"))).toEqual({
      kind: "attachAsLine",
      parallelId: "p",
      detachedId: "C",
    })
  })

  it("attachAfter after a step inside a parallel line", () => {
    const manifest: ExecutionManifest = {
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
    const doc = executionToReactFlow(manifest)
    expect(resolveFlowConnect(manifest, doc, connect("B", "C"))).toEqual({
      kind: "attachAfter",
      sourceId: "B",
      detachedId: "C",
    })
  })

  it("attachAfter inserts at loop body head", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "retry",
          expr: "(state) => true",
          maxRounds: 2,
          steps: [{ id: "tick", uses: "@executioncontrolprotocol/test.echo", input: { value: "t" }, as: "tick" }],
        },
      ],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const doc = executionToReactFlow(manifest)
    expect(resolveFlowConnect(manifest, doc, connect("retry", "C"))).toEqual({
      kind: "attachAfter",
      sourceId: "retry",
      detachedId: "C",
    })
  })

  it("does not attach a detached root onto a while loop head", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "retry",
          expr: "(state) => true",
          maxRounds: 2,
          steps: [{ id: "tick", uses: "@executioncontrolprotocol/test.echo", input: { value: "t" }, as: "tick" }],
        },
      ],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const doc = executionToReactFlow(manifest)
    expect(resolveFlowConnect(manifest, doc, connect("C", "retry"))).toBeUndefined()
  })

  it("returns undefined for in-flow to in-flow connections", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "A", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "A" },
        { id: "B", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "B" },
      ],
    }
    const doc = executionToReactFlow(manifest)
    expect(resolveFlowConnect(manifest, doc, connect("A", "B"))).toBeUndefined()
  })

  it("rejects when source is not in steps", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [],
      detached: [{ id: "C", uses: "@executioncontrolprotocol/test.echo", input: { value: "c" }, as: "C" }],
    }
    const doc = executionToReactFlow(manifest)
    expect(resolveFlowConnect(manifest, doc, connect("missing", "C"))).toBeUndefined()
  })
})