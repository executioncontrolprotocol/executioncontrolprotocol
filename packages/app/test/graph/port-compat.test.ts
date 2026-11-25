import { describe, expect, it } from "vitest"
import { firstMatchingPort, portTypeKind, portsAreCompatible } from "../../src/graph/port-compat.js"
import type { ReactFlowPort } from "../../src/graph/types.js"
import { fileRefValueSchemaHint } from "../../src/graph/value-schema-hint.js"

function port(typeLabel: string, valueSchema?: Record<string, unknown>): ReactFlowPort {
  return { id: typeLabel, name: typeLabel, typeLabel, valueSchema }
}

describe("port-compat", () => {
  it("matches same kinds and unknown", () => {
    expect(portsAreCompatible(port("string"), port("string!"))).toBe(true)
    expect(portsAreCompatible(port("unknown"), port("integer"))).toBe(true)
    expect(portsAreCompatible(port("string"), port("unknown"))).toBe(true)
  })

  it("applies numeric and enum widening rules", () => {
    expect(portsAreCompatible(port("integer"), port("number"))).toBe(true)
    expect(portsAreCompatible(port("number"), port("integer"))).toBe(false)
    expect(portsAreCompatible(port("string"), port("enum"))).toBe(true)
    expect(portsAreCompatible(port("enum"), port("string"))).toBe(true)
    expect(portsAreCompatible(port("enum"), port("enum!"))).toBe(true)
  })

  it("blocks file to url and allows url to file", () => {
    const fileOut = port("file", fileRefValueSchemaHint())
    const urlIn = port("url!", { "x-ecp-file": { access: "url" }, type: "object" })
  const urlOut = port("url", { "x-ecp-file": { access: "url" }, type: "object" })
    const fileIn = port("file", fileRefValueSchemaHint())
    expect(portsAreCompatible(fileOut, urlIn)).toBe(false)
    expect(portsAreCompatible(fileOut, port("url!"))).toBe(false)
    expect(portsAreCompatible(urlOut, fileIn)).toBe(true)
    expect(portsAreCompatible(fileOut, fileIn)).toBe(true)
  })

  it("classifies schema primitives", () => {
    for (const kind of ["string", "number", "integer", "boolean", "null", "array", "object"] as const) {
      expect(portTypeKind(port(kind, { type: kind }))).toBe(kind)
    }
    expect(portTypeKind(port("enum", { enum: ["a", "b"] }))).toBe("enum")
  })

  it("treats composite schemas as unknown", () => {
    expect(portTypeKind(port("x", { oneOf: [{ type: "string" }, { type: "number" }] }))).toBe("unknown")
    expect(portTypeKind(port("y", { anyOf: [{ type: "boolean" }] }))).toBe("unknown")
  })

  it("classifies schemas and labels", () => {
    expect(portTypeKind(port("file", { "x-ecp-file": {} }))).toBe("file")
    expect(portTypeKind(port("url", { "x-ecp-file": { access: "url" }, type: "object" }))).toBe("url")
    expect(portTypeKind(port("unknown", { type: ["string", "null"] }))).toBe("unknown")
    expect(portTypeKind(port("item"))).toBe("unknown")
  })

  it("matches input-side firstMatchingPort", () => {
    const sink = port("integer")
    const sources = [port("string"), port("number"), port("integer")]
    expect(firstMatchingPort(sink, sources, "input")?.id).toBe("integer")
    expect(firstMatchingPort(port("file"), [port("url!")], "output")).toBeUndefined()
  })

  it("rejects mismatched primitive kinds", () => {
    expect(portsAreCompatible(port("string"), port("integer"))).toBe(false)
    expect(portsAreCompatible(port("boolean"), port("string"))).toBe(false)
  })

  it("firstMatchingPort scans in order", () => {
    const origin = port("string")
    const accepts = [port("integer"), port("unknown"), port("string")]
    const match = firstMatchingPort(origin, accepts, "output")
    expect(match?.id).toBe("unknown")
    const returns = [port("number"), port("string")]
    expect(firstMatchingPort(origin, returns, "input")?.id).toBe("string")
    expect(firstMatchingPort(origin, [port("integer")], "output")).toBeUndefined()
  })
})