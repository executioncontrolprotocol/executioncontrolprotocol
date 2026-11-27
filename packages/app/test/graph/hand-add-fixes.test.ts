import type { ExecutionManifest, IfNode, StepNode } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { validateExecution, validateExecutionLayers } from "@executioncontrolprotocol/engine"
import {
  addCapabilityStep,
  addControlNode,
  appendEmptyParallelPath,
  connectInput,
  insertConnectedControlNode,
  insertConnectedStep,
  CONNECTION_EDIT_INPUT_ORIGIN,
  sourcePortPropertySchema,
  switchControlKind,
  EMPTY_INPUT_PORT_ID,
} from "../../src/graph/index.js"
import { cleanNodes, finalizeManifest } from "../../src/graph/manifest-walk.js"

const TRANSFORM_CAPABILITY_ID = "@executioncontrolprotocol/core.transform"

const echo = "@executioncontrolprotocol/test.echo"
const stubCapability = {
  id: echo,
  plugin: "test",
  package: "test",
  pluginVersion: "0.0.0",
  summary: "",
  description: "",
  useCases: [],
  projections: [],
  accepts: { type: "object", properties: { value: { type: "string" } } },
  returns: { type: "object", properties: { value: { type: "string" } } },
}

const transformCapability = {
  ...stubCapability,
  id: TRANSFORM_CAPABILITY_ID,
  contract: "step" as const,
  code: "script" as const,
}

const tierManifest = (): ExecutionManifest => ({
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  execution: {
    id: "tier",
    accepts: { type: "object", properties: { tier: { type: "string" } }, required: ["tier"] },
  },
  steps: [{ id: "start", uses: echo, as: "start", input: { value: { $ref: "state.tier" } } }],
})

describe("hand-add fixes", () => {
  it("finalizeManifest keeps a single empty if", () => {
    const result = finalizeManifest({
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", then: [] }],
    })
    expect(result.ok).toBe(true)
  })

  it("cleanNodes keeps an if with an empty then", () => {
    const kept = cleanNodes([
      { type: "if", id: "g", expression: "true", then: [] } satisfies IfNode,
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0]?.type).toBe("if")
  })

  it("addControlNode inserts on every placement", () => {
    const base: ExecutionManifest = {
      ...tierManifest(),
      steps: [
        { type: "if", id: "gate", expression: "true", then: [] },
        { type: "parallel", id: "p", paths: [[], []] },
        { type: "loop", id: "l", mode: "for", as: "i", input: { count: 1 }, steps: [] },
      ],
    }
    expect(addControlNode(base, { kind: "top" }).ok).toBe(true)
    expect(addControlNode(base, { kind: "then-side", ifId: "gate" }).ok).toBe(true)
    expect(addControlNode(base, { kind: "new-path", parallelId: "p" }).ok).toBe(true)
    expect(addControlNode(base, { kind: "loop-body", loopId: "l" }).ok).toBe(true)
    expect(addControlNode(base, { kind: "loop-body", loopId: "nope" }).ok).toBe(false)
  })

  it("refuses insertConnectedControlNode from input side", () => {
    const refusal = insertConnectedControlNode(
      tierManifest(),
      { nodeId: "start", handleId: "value", side: "input" },
      { id: "value", name: "value", typeLabel: "string" },
    )
    expect(refusal).toMatchObject({ ok: false, reason: CONNECTION_EDIT_INPUT_ORIGIN })
  })

  it("insertConnectedControlNode binds tier from Inputs", () => {
    const result = insertConnectedControlNode(
      tierManifest(),
      { nodeId: "ecp:accepts", handleId: "tier", side: "output" },
      { id: "tier", name: "tier", typeLabel: "string", valueSchema: { type: "string" }, required: true },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const gate = result.manifest.steps.find((node) => node.type === "if") as IfNode
    expect(gate.accepts?.properties?.tier).toEqual({ type: "string" })
    expect(gate.input?.tier).toEqual({ $ref: "state.tier" })
  })

  it("sourcePortPropertySchema types tier as string", () => {
    const schema = sourcePortPropertySchema(tierManifest(), "ecp:accepts", "tier")
    expect(schema).toEqual({ type: "string" })
  })

  it("transform skeleton validates when capability metadata is present", async () => {
    const added = addCapabilityStep(tierManifest(), { id: TRANSFORM_CAPABILITY_ID, contract: "step", code: "script" }, { kind: "top" })
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const step = added.manifest.steps.find((node) => node.id === added.stepId) as StepNode
    expect(step.accepts).toEqual({ type: "object", properties: {} })
    expect(step.script).toEqual({ lang: "js", source: "return input" })
    const result = await validateExecution(added.manifest, { capabilities: [transformCapability, stubCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_SCRIPT_INVALID")).toBe(false)
  })

  it("empty then is L2 only and allows draft save", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", then: [] }],
    }
    const layers = await validateExecutionLayers(manifest, { capabilities: [stubCapability] })
    expect(layers.blocksDraft).toBe(false)
    expect(layers.result.issues.some((issue) => issue.message === "`then` has no nodes")).toBe(true)
    expect((await validateExecution(manifest, { capabilities: [stubCapability] })).valid).toBe(false)
  })

  it("insertConnectedStep wires transform skeleton from tier output", () => {
    const base = tierManifest()
    const added = insertConnectedStep(
      base,
      { id: TRANSFORM_CAPABILITY_ID, contract: "step", code: "script" },
      { nodeId: "ecp:accepts", handleId: "tier", side: "output" },
      { id: "tier", name: "tier", typeLabel: "string", valueSchema: { type: "string" }, required: true },
    )
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const step = added.manifest.steps.find((node) => node.id === added.stepId) as StepNode
    expect(step.accepts?.properties?.tier).toEqual({ type: "string" })
    expect(step.input?.tier).toEqual({ $ref: "state.tier" })
  })

  it("appendEmptyParallelPath and kind switches allow empty path 2", async () => {
    let manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [{ id: "a", uses: echo, as: "a" }],
            [{ id: "b", uses: echo, as: "b" }],
          ],
        },
      ],
    }
    const added = appendEmptyParallelPath(manifest, "p")
    expect(added.ok).toBe(true)
    if (added.ok) manifest = added.manifest
    expect(manifest.steps[0]?.type === "parallel" && manifest.steps[0].paths).toHaveLength(3)

    const switched = switchControlKind(
      { ...manifest, steps: [{ type: "if", id: "g", expression: "true", then: [{ id: "s", uses: echo, as: "s" }] }] },
      "g",
      "parallel",
    )
    expect(switched.ok).toBe(true)
    const issues = await validateExecution(switched.ok ? switched.manifest : manifest, { capabilities: [stubCapability] })
    expect(issues.issues.some((issue) => issue.message === "path 2 has no nodes")).toBe(true)
  })

  it("refuses insertConnectedStep from an input-side origin", () => {
    const base = tierManifest()
    const refusal = insertConnectedStep(
      base,
      { id: echo },
      { nodeId: "start", handleId: "value", side: "input" },
      { id: "value", name: "value", typeLabel: "string" },
    )
    expect(refusal).toMatchObject({ ok: false, reason: CONNECTION_EDIT_INPUT_ORIGIN })
  })

  it("sourcePortPropertySchema covers step output and loop index", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "writer",
          uses: echo,
          as: "writer",
          returns: { type: "object", properties: { text: { type: "string" } } },
        },
        { type: "loop", id: "l", mode: "forEach", as: "row", input: { items: { $ref: "state.rows" } }, steps: [] },
      ],
    }
    expect(sourcePortPropertySchema(manifest, "writer", "text")).toEqual({ type: "string" })
    expect(sourcePortPropertySchema(manifest, "l", "index")).toEqual({ type: "integer" })
  })

  it("connectInput uses source schema on empty port", () => {
    const target: IfNode = { type: "if", id: "g", expression: "true", then: [] }
    const manifest: ExecutionManifest = { ...tierManifest(), steps: [target] }
    const wired = connectInput(manifest, {
      sourceNodeId: "ecp:accepts",
      sourceHandle: "tier",
      targetStepId: "g",
      targetHandle: EMPTY_INPUT_PORT_ID,
      sourcePortSchema: { type: "string" },
    })
    expect(wired.ok).toBe(true)
    if (!wired.ok) return
    const gate = wired.manifest.steps[0] as IfNode
    expect(gate.accepts?.properties?.tier).toEqual({ type: "string" })
  })
})