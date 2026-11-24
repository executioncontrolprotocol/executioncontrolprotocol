import { describe, expect, it } from "vitest"
import { groupCapabilities, type CapabilityMenuEntry } from "../../src/web/lib/group-capabilities.js"

const a: CapabilityMenuEntry = {
  id: "@executioncontrolprotocol/test.echo",
  plugin: "@executioncontrolprotocol/test",
  summary: "Echo",
}
const b: CapabilityMenuEntry = {
  id: "@executioncontrolprotocol/core.transform",
  plugin: "@executioncontrolprotocol/core",
  summary: "Transform",
}
const c: CapabilityMenuEntry = {
  id: "@executioncontrolprotocol/test.fail",
  plugin: "@executioncontrolprotocol/test",
  summary: "Fail",
}

describe("groupCapabilities", () => {
  it("returns empty for no entries", () => {
    expect(groupCapabilities([])).toEqual([])
  })

  it("groups one plugin", () => {
    expect(groupCapabilities([a, c])).toEqual([
      { plugin: "@executioncontrolprotocol/test", entries: [a, c] },
    ])
  })

  it("preserves first-seen plugin order and entry order", () => {
    expect(groupCapabilities([a, b, c])).toEqual([
      { plugin: "@executioncontrolprotocol/test", entries: [a, c] },
      { plugin: "@executioncontrolprotocol/core", entries: [b] },
    ])
  })
})