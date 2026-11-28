import { describe, expect, it } from "vitest"
import {
  CORE_GROUP_ID,
  groupCapabilities,
  isCoreTransformEntry,
  type CapabilityMenuEntry,
} from "../../src/web/lib/group-capabilities.js"
import { CONTROL_NODE_ENTRY_ID } from "../../src/graph/structure-edit.js"

const a: CapabilityMenuEntry = {
  id: "@executioncontrolprotocol/test.echo",
  plugin: "@executioncontrolprotocol/test",
  summary: "Echo",
}
const transform: CapabilityMenuEntry = {
  id: "@executioncontrolprotocol/core.transform",
  plugin: "@executioncontrolprotocol/core",
  summary: "Transform",
  contract: "step",
  code: "script",
}
const c: CapabilityMenuEntry = {
  id: "@executioncontrolprotocol/test.fail",
  plugin: "@executioncontrolprotocol/test",
  summary: "Fail",
}

describe("groupCapabilities", () => {
  it("returns empty for no entries", () => {
    const groups = groupCapabilities([])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.plugin).toBe(CORE_GROUP_ID)
    expect(groups[0]!.entries[0]!.id).toBe(CONTROL_NODE_ENTRY_ID)
  })

  it("puts control node and transforms in Core", () => {
    expect(isCoreTransformEntry(transform)).toBe(true)
    expect(groupCapabilities([a, transform, c])).toEqual([
      {
        plugin: CORE_GROUP_ID,
        entries: [
          expect.objectContaining({ id: CONTROL_NODE_ENTRY_ID, controlNode: true }),
          transform,
        ],
      },
      { plugin: "@executioncontrolprotocol/test", entries: [a, c] },
    ])
  })

  it("excludes expression-only steps from Core", () => {
    const expr: CapabilityMenuEntry = {
      id: "@executioncontrolprotocol/core.expr",
      plugin: "@executioncontrolprotocol/core",
      summary: "Expr",
      contract: "step",
      code: "expression",
    }
    expect(isCoreTransformEntry(expr)).toBe(false)
    const groups = groupCapabilities([expr, a])
    expect(groups.find((group) => group.plugin === CORE_GROUP_ID)?.entries).toHaveLength(1)
    expect(groups.some((group) => group.entries.some((row) => row.id === expr.id))).toBe(true)
  })
})