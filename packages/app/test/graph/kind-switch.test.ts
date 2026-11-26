import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  KIND_SWITCH_LOOP_PARALLEL,
  KIND_SWITCH_NO_ELSE,
  KIND_SWITCH_TOO_MANY_PATHS,
  kindSwitchAvailability,
  switchControlKind,
} from "../../src/graph/kind-switch.js"

const echo = "@executioncontrolprotocol/test.echo"

describe("kindSwitchAvailability", () => {
  it("enables all kinds for a loop except parallel", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "loop", id: "l", mode: "forEach", as: "x", input: { items: { $ref: "state.x" } }, steps: [] }],
    }
    const rows = kindSwitchAvailability(manifest, "l")
    expect(rows.find((row) => row.kind === "if")?.enabled).toBe(true)
    expect(rows.find((row) => row.kind === "for")?.enabled).toBe(true)
    expect(rows.find((row) => row.kind === "parallel")?.enabled).toBe(false)
  })
  it("refuses if to parallel without else", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", then: [{ id: "s", uses: echo, as: "s" }] }],
    }
    const row = kindSwitchAvailability(manifest, "g").find((entry) => entry.kind === "parallel")
    expect(row?.enabled).toBe(false)
    expect(row?.reason).toBe(KIND_SWITCH_NO_ELSE)
  })

  it("refuses loop to parallel", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "loop", id: "l", mode: "for", as: "i", input: { count: 1 }, steps: [] }],
    }
    const row = kindSwitchAvailability(manifest, "l").find((entry) => entry.kind === "parallel")
    expect(row?.enabled).toBe(false)
  })

  it("enables if for parallel with two paths", () => {
    const manifest: ExecutionManifest = {
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
    const row = kindSwitchAvailability(manifest, "p").find((entry) => entry.kind === "if")
    expect(row?.enabled).toBe(true)
  })

  it("refuses parallel to if with three paths", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [{ id: "a", uses: echo, as: "a" }],
            [{ id: "b", uses: echo, as: "b" }],
            [{ id: "c", uses: echo, as: "c" }],
          ],
        },
      ],
    }
    const row = kindSwitchAvailability(manifest, "p").find((entry) => entry.kind === "if")
    expect(row?.enabled).toBe(false)
    expect(row?.reason).toBe(KIND_SWITCH_TOO_MANY_PATHS)
  })

  it("returns all disabled when the node is missing", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: echo, as: "s" }],
    }
    const rows = kindSwitchAvailability(manifest, "missing")
    expect(rows.every((row) => !row.enabled)).toBe(true)
  })
})

describe("switchControlKind", () => {
  it("switches loop to if and turns driver into input", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "lp",
          mode: "forEach",
          as: "row",
          input: { items: { $ref: "state.rows" } },
          steps: [{ id: "b", uses: echo, as: "b" }],
        },
      ],
    }
    const result = switchControlKind(manifest, "lp", "if")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.manifest.steps[0]!
    expect(node.type).toBe("if")
    expect(node.id).toBe("lp")
    expect(node.type === "if" && node.input?.items).toEqual({ $ref: "state.rows" })
  })

  it("switches if to forEach with body steps", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          then: [{ id: "t", uses: echo, as: "t" }],
          else: [{ id: "e", uses: echo, as: "e" }],
          input: { items: { $ref: "state.things" } },
          accepts: { type: "object", properties: { items: { type: "array" } } },
        },
      ],
    }
    const result = switchControlKind(manifest, "g", "forEach")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.manifest.steps[0]!
    expect(node.type).toBe("loop")
    expect(node.type === "loop" && node.mode).toBe("forEach")
    expect(node.type === "loop" && node.steps.length).toBe(2)
  })

  it("switches parallel to if with two paths", () => {
    const manifest: ExecutionManifest = {
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
    const result = switchControlKind(manifest, "p", "if")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.manifest.steps[0]!
    expect(node.type).toBe("if")
    expect(node.type === "if" && node.then.length).toBe(1)
    expect(node.type === "if" && node.else?.length).toBe(1)
  })

  it("switches if to for with default count", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          then: [{ id: "t", uses: echo, as: "t" }],
          else: [{ id: "e", uses: echo, as: "e" }],
        },
      ],
    }
    const result = switchControlKind(manifest, "g", "for")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.manifest.steps[0]!
    expect(node.type === "loop" && node.mode).toBe("for")
    expect(node.type === "loop" && node.input?.count).toBe(1)
  })
  it("keeps node id when switching if to parallel", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "gate",
          expression: "false",
          then: [{ id: "t", uses: echo, as: "t" }],
          else: [{ id: "e", uses: echo, as: "e" }],
        },
      ],
    }
    const result = switchControlKind(manifest, "gate", "parallel")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.manifest.steps[0]!
    expect(node.type).toBe("parallel")
    expect(node.id).toBe("gate")
    expect(node.type === "parallel" && node.paths.length).toBe(2)
  })

  it("refuses if to parallel without else", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", then: [{ id: "s", uses: echo, as: "s" }] }],
    }
    const result = switchControlKind(manifest, "g", "parallel")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(KIND_SWITCH_NO_ELSE)
  })

  it("returns noop when kind unchanged", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", then: [{ id: "s", uses: echo, as: "s" }], else: [] }],
    }
    expect(switchControlKind(manifest, "g", "if").ok).toBe(true)
  })

  it("reuses integer driver when switching if to for", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          then: [{ id: "t", uses: echo, as: "t" }],
          else: [{ id: "e", uses: echo, as: "e" }],
          input: { rounds: { $ref: "state.n" }, extra: "y" },
          accepts: {
            type: "object",
            properties: { rounds: { type: "integer" }, extra: { type: "string" } },
          },
        },
      ],
    }
    const result = switchControlKind(manifest, "g", "for")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.manifest.steps[0]!
    expect(node.type === "loop" && node.input?.count).toEqual({ $ref: "state.n" })
  })

  it("switches parallel to forEach", () => {
    const manifest: ExecutionManifest = {
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
          input: { things: { $ref: "state.things" } },
          accepts: { type: "object", properties: { things: { type: "array" } } },
        },
      ],
    }
    const result = switchControlKind(manifest, "p", "forEach")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.steps[0]?.type === "loop" && result.manifest.steps[0].input?.items).toEqual({
      $ref: "state.things",
    })
  })

  it("refuses switch when structure is missing", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: echo, as: "s" }],
    }
    expect(switchControlKind(manifest, "nope", "if").ok).toBe(false)
  })

  it("switches loop to if preserving forEach driver", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "l",
          mode: "forEach",
          as: "x",
          input: { items: { $ref: "state.rows" } },
          steps: [{ id: "b", uses: echo, as: "b" }],
        },
      ],
    }
    const result = switchControlKind(manifest, "l", "if")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.manifest.steps[0]!
    expect(node.type === "if" && node.input?.items).toEqual({ $ref: "state.rows" })
  })

  it("refuses loop to parallel", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "loop", id: "l", mode: "for", as: "i", input: { count: 1 }, steps: [{ id: "s", uses: echo, as: "s" }] }],
    }
    const result = switchControlKind(manifest, "l", "parallel")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(KIND_SWITCH_LOOP_PARALLEL)
  })

  it("refuses parallel to if when three paths", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [{ id: "a", uses: echo, as: "a" }],
            [{ id: "b", uses: echo, as: "b" }],
            [{ id: "c", uses: echo, as: "c" }],
          ],
        },
      ],
    }
    const result = switchControlKind(manifest, "p", "if")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(KIND_SWITCH_TOO_MANY_PATHS)
  })

  it("preserves label when switching if to parallel", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          label: "My gate",
          expression: "true",
          then: [{ id: "t", uses: echo, as: "t" }],
          else: [{ id: "e", uses: echo, as: "e" }],
        },
      ],
    }
    const result = switchControlKind(manifest, "g", "parallel")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.steps[0]?.label).toBe("My gate")
  })

  it("switches for loop to forEach", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { type: "loop", id: "l", mode: "for", as: "i", input: { count: 2 }, steps: [{ id: "s", uses: echo, as: "s" }] },
      ],
    }
    const result = switchControlKind(manifest, "l", "forEach")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.steps[0]?.type === "loop" && result.manifest.steps[0].mode).toBe("forEach")
  })
})