import { describe, expect, it } from "vitest"
import { step, workflow } from "@executioncontrolprotocol/core"
import type { CapabilityDescription, StepNode, WorkflowManifest } from "@executioncontrolprotocol/core/types"
import { addCapabilityStep, firstMatchingPort, portsFromCapabilitySchema } from "../src/ui/lib/add-capability-step.js"
import type { CapabilityDiscoveryOrigin } from "../src/ui/lib/capability-discovery.js"
import { WORKFLOW_ACCEPTS_NODE_ID } from "../src/graph/index.js"

function cap(partial: Partial<CapabilityDescription> & Pick<CapabilityDescription, "id">): CapabilityDescription {
  return {
    extension: "@executioncontrolprotocol/test",
    label: partial.label ?? partial.id.split(".").pop(),
    ...partial,
  }
}

function origin(partial: Partial<CapabilityDiscoveryOrigin> & Pick<CapabilityDiscoveryOrigin, "nodeId" | "handleId">): CapabilityDiscoveryOrigin {
  return {
    handleType: "source",
    port: { typeLabel: "unknown" },
    ...partial,
  }
}

function stepsOf(manifest: WorkflowManifest): StepNode[] {
  return manifest.steps.filter((node): node is StepNode => !node.type || node.type === "step")
}

describe("firstMatchingPort", () => {
  it("prefers the first required compatible port", () => {
    const ports = portsFromCapabilitySchema(
      {
        type: "object",
        properties: {
          note: { type: "string" },
          text: { type: "string" },
        },
        required: ["text"],
      },
      "input"
    )
    const match = firstMatchingPort(ports, { typeLabel: "string" }, "downstream")
    expect(match?.id).toBe("text")
  })

  it("treats unknown as compatible with any kind", () => {
    const ports = portsFromCapabilitySchema(
      { type: "object", properties: { n: { type: "number" } }, required: ["n"] },
      "input"
    )
    expect(firstMatchingPort(ports, { typeLabel: "unknown" }, "downstream")?.id).toBe("n")
  })
})

describe("addCapabilityStep", () => {
  it("wires a source handle to the first matching input", () => {
    const manifest = workflow("Chain")
      .run([step("@executioncontrolprotocol/test.echo", "First").with({ value: "a" }).as("out")])
      .toManifest()
    const sourceId = stepsOf(manifest)[0]!.id
    const result = addCapabilityStep(manifest, {
      capability: cap({
        id: "@executioncontrolprotocol/test.echo",
        label: "Echo",
        inputSchema: {
          type: "object",
          properties: { value: {} },
          required: ["value"],
        },
      }),
      origin: origin({
        nodeId: sourceId,
        handleId: "output",
        port: { typeLabel: "unknown" },
      }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const added = stepsOf(result.manifest).find((node) => node.id !== sourceId)
    expect(added?.uses).toBe("@executioncontrolprotocol/test.echo")
    expect(added?.as).toBeDefined()
    expect(added?.input).toMatchObject({ value: { $ref: "state.out" } })
  })

  it("creates an accepts field when dragging from Inputs placeholder", () => {
    const manifest = workflow("From input").run([]).toManifest()
    const result = addCapabilityStep(manifest, {
      capability: cap({
        id: "@executioncontrolprotocol/test.echo",
        label: "Echo",
        inputSchema: {
          type: "object",
          properties: { value: {} },
          required: ["value"],
        },
      }),
      origin: origin({
        nodeId: WORKFLOW_ACCEPTS_NODE_ID,
        handleId: "+",
        port: { typeLabel: "unknown" },
      }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const added = stepsOf(result.manifest)[0]
    expect(added?.input).toMatchObject({ value: { $ref: "state.value" } })
    expect(result.manifest.workflow.accepts).toMatchObject({
      type: "object",
      properties: { value: {} },
    })
  })

  it("wires an upstream drag from a target handle to the new step output", () => {
    const manifest = workflow("Up")
      .run([step("@executioncontrolprotocol/test.echo", "Sink").with({ value: "x" }).id("sink")])
      .toManifest()
    const result = addCapabilityStep(manifest, {
      capability: cap({
        id: "@executioncontrolprotocol/test.echo",
        label: "Echo",
        outputSchema: {
          type: "object",
          properties: { echo: {} },
          required: ["echo"],
        },
      }),
      origin: origin({
        nodeId: "sink",
        handleId: "value",
        handleType: "target",
        port: { typeLabel: "unknown" },
      }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const source = stepsOf(result.manifest).find((node) => node.id !== "sink")
    const sink = stepsOf(result.manifest).find((node) => node.id === "sink")
    expect(source?.as).toBeDefined()
    expect(sink?.input).toMatchObject({
      value: { $ref: `state.${source?.as}.echo` },
    })
  })

  it("inserts without a wire when no port matches", () => {
    const manifest = workflow("Mismatch")
      .run([step("@executioncontrolprotocol/test.echo", "First").with({ value: "a" }).as("out")])
      .toManifest()
    const sourceId = stepsOf(manifest)[0]!.id
    const result = addCapabilityStep(manifest, {
      capability: cap({
        id: "@vendor/typed.numbers",
        label: "Numbers",
        inputSchema: {
          type: "object",
          properties: { n: { type: "number" } },
          required: ["n"],
        },
      }),
      origin: origin({
        nodeId: sourceId,
        handleId: "output",
        port: { typeLabel: "string", valueSchema: { type: "string" } },
      }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(stepsOf(result.manifest)).toHaveLength(2)
    const added = stepsOf(result.manifest).find((node) => node.id !== sourceId)
    expect(added?.input).toBeUndefined()
  })

  it("allocates unique id and as on collision", () => {
    const manifest = workflow("Dup")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "a" }).as("echo")])
      .toManifest()
    const result = addCapabilityStep(manifest, {
      capability: cap({
        id: "@executioncontrolprotocol/test.echo",
        label: "Echo",
        inputSchema: { type: "object", properties: { value: {} } },
      }),
      origin: origin({
        nodeId: stepsOf(manifest)[0]!.id,
        handleId: "output",
      }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = stepsOf(result.manifest).map((node) => node.id)
    const asKeys = stepsOf(result.manifest).map((node) => node.as)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(asKeys).size).toBe(asKeys.length)
  })
})
