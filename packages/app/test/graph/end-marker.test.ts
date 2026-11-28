import { describe, expect, it } from "vitest"
import { endMarkerId, parseEndMarkerId } from "../../src/graph/types.js"

describe("parseEndMarkerId", () => {
  it("parses then, else, loop, and path sides", () => {
    expect(parseEndMarkerId(endMarkerId("express", "then"))).toEqual({
      structureId: "express",
      side: "then",
    })
    expect(parseEndMarkerId(endMarkerId("gate", "else"))).toEqual({ structureId: "gate", side: "else" })
    expect(parseEndMarkerId(endMarkerId("lp", "loop"))).toEqual({ structureId: "lp", side: "loop" })
    expect(parseEndMarkerId(endMarkerId("work", "path-2"))).toEqual({ structureId: "work", side: "path-2" })
  })

  it("returns undefined for non-marker ids", () => {
    expect(parseEndMarkerId("end:nope")).toBeUndefined()
    expect(parseEndMarkerId("pick-fast")).toBeUndefined()
    expect(parseEndMarkerId("")).toBeUndefined()
    expect(parseEndMarkerId("end:")).toBeUndefined()
    expect(parseEndMarkerId("end:only-id")).toBeUndefined()
  })

  it("rejects invalid side tokens", () => {
    expect(parseEndMarkerId("end:solo:if")).toBeUndefined()
    expect(parseEndMarkerId("end:solo:merge")).toBeUndefined()
    expect(parseEndMarkerId("end::then")).toBeUndefined()
  })
})