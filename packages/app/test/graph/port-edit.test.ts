import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  addInputPort,
  PORT_EDIT_DUPLICATE,
  PORT_EDIT_NOT_MULTI,
  renameInputPort,
  removeInputPort,
  uniquePortIdFromSource,
} from "../../src/graph/port-edit.js"

describe("port-edit", () => {
  it("adds a port without an initial binding", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", then: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", as: "s" }] }],
    }
    const added = addInputPort(manifest, "g", "extra", { type: "string" })
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const gate = added.manifest.steps[0]!
    expect(gate.type === "if" && gate.input?.extra).toBeUndefined()
    expect(gate.type === "if" && (gate.accepts as { properties?: Record<string, unknown> }).properties?.extra).toEqual({
      type: "string",
    })
  })

  it("adds and removes an input port on an if", () => {
    let manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", as: "g", then: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", as: "s" }] }],
    }
    const added = addInputPort(manifest, "g", "order", { type: "object" }, { $ref: "state.order" })
    expect(added.ok).toBe(true)
    if (!added.ok) return
    manifest = added.manifest
    const ifNode = manifest.steps[0]!
    expect(ifNode.type === "if" && ifNode.input?.order).toBeTruthy()
    const dup = addInputPort(manifest, "g", "order", { type: "object" })
    expect(dup.ok).toBe(false)
    if (dup.ok) return
    expect(dup.reason).toBe(PORT_EDIT_DUPLICATE)
    const renamed = renameInputPort(manifest, "g", "order", "pick")
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    manifest = renamed.manifest
    const removed = removeInputPort(manifest, "g", "pick")
    expect(removed.ok).toBe(true)
  })

  it("rename rewrites list refs inside the tunnel", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          as: "g",
          input: { order: { $ref: ["state.a", "state.b"] } },
          accepts: { type: "object", properties: { order: { type: "array" } } },
          then: [
            {
              id: "s",
              uses: "@executioncontrolprotocol/test.echo",
              as: "s",
              input: { value: { $ref: "state.g.order" } },
            },
          ],
        },
      ],
    }
    const renamed = renameInputPort(manifest, "g", "order", "pick")
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    const gate = renamed.manifest.steps[0]!
    expect(gate.type === "if" && gate.input?.pick).toEqual({ $ref: ["state.a", "state.b"] })
    const step = gate.type === "if" ? gate.then[0] : undefined
    expect(step && "input" in step && step.input?.value).toEqual({ $ref: "state.g.pick" })
  })

  it("rename rewrites tunnel refs that read through as", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          as: "g",
          input: { order: { $ref: "state.up" } },
          accepts: { type: "object", properties: { order: { type: "object" } } },
          then: [
            {
              id: "s",
              uses: "@executioncontrolprotocol/test.echo",
              as: "s",
              input: { value: { $ref: "state.g.order" } },
            },
          ],
        },
      ],
    }
    const renamed = renameInputPort(manifest, "g", "order", "pick")
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    const step = renamed.manifest.steps[0]?.type === "if" ? renamed.manifest.steps[0].then[0] : undefined
    expect(step && "input" in step && step.input?.value).toEqual({ $ref: "state.g.pick" })
  })

  it("removes a port and renames refuses duplicate targets", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          accepts: { type: "object", properties: { a: { type: "string" }, b: { type: "string" } } },
          input: { a: { $ref: "state.x" } },
          paths: [
            [{ id: "s", uses: "@executioncontrolprotocol/test.echo", as: "s" }],
            [{ id: "t", uses: "@executioncontrolprotocol/test.echo", as: "t" }],
          ],
        },
      ],
    }
    const removed = removeInputPort(manifest, "p", "a")
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    const dup = renameInputPort(removed.manifest, "p", "b", "b")
    expect(dup.ok).toBe(true)
    const clash = addInputPort(removed.manifest, "p", "b", { type: "string" })
    expect(clash.ok).toBe(false)
    expect(clash.ok ? "" : clash.reason).toBe(PORT_EDIT_DUPLICATE)
  })

  it("allocates a unique port id when the stem collides", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          accepts: { type: "object", properties: { order: { type: "string" } } },
          input: { order: { $ref: "state.x" } },
          then: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", as: "s" }],
        },
      ],
    }
    const gate = manifest.steps[0]!
    if (gate.type !== "if") throw new Error("expected if")
    const id = uniquePortIdFromSource(manifest, gate, "order")
    expect(id).toMatch(/^order\d*$/)
  })

  it("refuses multi-cardinal edits on a plain capability step", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
    }
    expect(addInputPort(manifest, "s", "extra", { type: "string" }).reason).toBe(PORT_EDIT_NOT_MULTI)
  })

  it("refuses rename to an existing port name", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          accepts: { type: "object", properties: { a: { type: "string" }, b: { type: "string" } } },
          input: { a: { $ref: "state.x" }, b: { $ref: "state.y" } },
          then: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", as: "s" }],
        },
      ],
    }
    const result = renameInputPort(manifest, "g", "a", "b")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(PORT_EDIT_DUPLICATE)
  })

  it("refuses edits on a missing node", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", as: "s" }],
    }
    expect(addInputPort(manifest, "missing", "x", { type: "string" }).ok).toBe(false)
    expect(removeInputPort(manifest, "missing", "x").ok).toBe(false)
  })

  it("rename is a noop when the name is unchanged", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          accepts: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
          input: { a: { $ref: "state.x" } },
          then: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", as: "s" }],
        },
      ],
    }
    const result = renameInputPort(manifest, "g", "a", "a")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest).toEqual(manifest)
  })

  it("refuses renaming a port that does not exist", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", then: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", as: "s" }] }],
    }
    expect(renameInputPort(manifest, "g", "missing", "new").ok).toBe(false)
  })

  it("adds a port on a transform step with accepts", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "map",
          uses: "@executioncontrolprotocol/core.transform",
          as: "map",
          accepts: { type: "object", properties: { value: { type: "string" } } },
          input: { value: "x" },
          script: { lang: "js", source: "return input" },
        },
      ],
    }
    const added = addInputPort(manifest, "map", "extra", { type: "string" }, "more")
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const step = added.manifest.steps[0]!
    expect(isStepNodeWithAccepts(step) && step.input?.extra).toBe("more")
  })
})

function isStepNodeWithAccepts(step: ExecutionManifest["steps"][number]): step is {
  input?: Record<string, unknown>
} {
  return typeof step === "object" && step !== null && "input" in step
}