import { describe, expect, it } from "vitest"
import { step, workflow } from "@executioncontrolprotocol/core"
import { renderPatchedManifest, WORKFLOW_RETURNS_NODE_ID } from "../src/graph/index.js"
import {
  connectPorts,
  disconnectPorts,
  patchOpsForManifest,
} from "../src/ui/lib/graph-edit.js"
import { portsAreCompatible } from "../src/ui/lib/step-connect.js"
import { RETURNS_PLACEHOLDER_HANDLE } from "../src/ui/lib/workflow-io.js"

function twoStepManifest(sourceAs?: string) {
  const source = step("@executioncontrolprotocol/test.echo", "First").with({ value: "a" })
  const built = sourceAs ? source.as(sourceAs) : source
  return workflow("Chain")
    .run([
      built,
      step("@executioncontrolprotocol/test.echo", "Second").with({ value: "b" }),
    ])
    .toManifest()
}

describe("graph-edit connect/disconnect", () => {
  it("renders Fluent with a state ref after a compatible port connect", () => {
    const manifest = twoStepManifest("out")
    const sourceId = manifest.steps[0] && "id" in manifest.steps[0] ? manifest.steps[0].id : "first"
    const targetId = manifest.steps[1] && "id" in manifest.steps[1] ? manifest.steps[1].id : "second"
    const result = connectPorts(manifest, {
      sourceStepId: sourceId,
      targetStepId: targetId,
      sourceHandle: "output",
      targetHandle: "value",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const fluent = renderPatchedManifest(manifest, patchOpsForManifest(manifest, result.manifest))
    expect(fluent).toMatch(/\$ref:\s*["']state\.out["']|ref\(["']out["']\)/)
    expect(fluent).not.toContain('"b"')
  })

  it("rejects a connection when the source step has no store key", () => {
    const manifest = twoStepManifest()
    const sourceId = manifest.steps[0] && "id" in manifest.steps[0] ? manifest.steps[0].id : "first"
    const targetId = manifest.steps[1] && "id" in manifest.steps[1] ? manifest.steps[1].id : "second"
    const result = connectPorts(manifest, {
      sourceStepId: sourceId,
      targetStepId: targetId,
      sourceHandle: "output",
      targetHandle: "value",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/store key/i)
  })

  it("treats mismatched port kinds as incompatible", () => {
    expect(
      portsAreCompatible({ typeLabel: "string" }, { typeLabel: "number" })
    ).toBe(false)
    expect(
      portsAreCompatible({ typeLabel: "string" }, { typeLabel: "string" })
    ).toBe(true)
    expect(
      portsAreCompatible({ typeLabel: "unknown" }, { typeLabel: "number" })
    ).toBe(true)
  })

  it("clears the target binding on disconnect", () => {
    const manifest = twoStepManifest("out")
    const sourceId = manifest.steps[0] && "id" in manifest.steps[0] ? manifest.steps[0].id : "first"
    const targetId = manifest.steps[1] && "id" in manifest.steps[1] ? manifest.steps[1].id : "second"
    const connected = connectPorts(manifest, {
      sourceStepId: sourceId,
      targetStepId: targetId,
      sourceHandle: "output",
      targetHandle: "value",
    })
    expect(connected.ok).toBe(true)
    if (!connected.ok) return
    const disconnected = disconnectPorts(connected.manifest, {
      targetStepId: targetId,
      targetHandle: "value",
    })
    expect(disconnected.ok).toBe(true)
    if (!disconnected.ok) return
    const fluent = renderPatchedManifest(
      connected.manifest,
      patchOpsForManifest(connected.manifest, disconnected.manifest)
    )
    expect(fluent).not.toMatch(/state\.out/)
  })

  it("does not stamp object on an unknown field wired to Outputs", () => {
    const manifest = workflow("Echo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "a" }).as("echo")])
      .toManifest()
    const sourceId = manifest.steps[0] && "id" in manifest.steps[0] ? manifest.steps[0].id : "echo"
    const result = connectPorts(manifest, {
      sourceStepId: sourceId,
      targetStepId: WORKFLOW_RETURNS_NODE_ID,
      sourceHandle: "echo",
      targetHandle: RETURNS_PLACEHOLDER_HANDLE,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const returns = result.manifest.workflow.returns as {
      properties: Record<string, Record<string, unknown>>
    }
    expect(returns.properties["echo.echo"]).toEqual({})
    expect(returns.properties["echo.echo"]?.type).toBeUndefined()
  })

  it("defaults whole-step Outputs wires to object when the source has no schema", () => {
    const manifest = workflow("Echo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "a" }).as("echo")])
      .toManifest()
    const sourceId = manifest.steps[0] && "id" in manifest.steps[0] ? manifest.steps[0].id : "echo"
    const result = connectPorts(manifest, {
      sourceStepId: sourceId,
      targetStepId: WORKFLOW_RETURNS_NODE_ID,
      sourceHandle: "output",
      targetHandle: RETURNS_PLACEHOLDER_HANDLE,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const returns = result.manifest.workflow.returns as {
      properties: Record<string, Record<string, unknown>>
    }
    expect(returns.properties.echo).toEqual({ type: "object" })
  })

  it("copies a typed field schema onto the dotted returns property", () => {
    const manifest = workflow("Echo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "a" }).as("echo")])
      .toManifest()
    const sourceId = manifest.steps[0] && "id" in manifest.steps[0] ? manifest.steps[0].id : "echo"
    const result = connectPorts(manifest, {
      sourceStepId: sourceId,
      targetStepId: WORKFLOW_RETURNS_NODE_ID,
      sourceHandle: "echo",
      targetHandle: RETURNS_PLACEHOLDER_HANDLE,
      valueSchema: { type: "string" },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const returns = result.manifest.workflow.returns as {
      properties: Record<string, Record<string, unknown>>
    }
    expect(returns.properties["echo.echo"]).toEqual({ type: "string" })
  })
})
