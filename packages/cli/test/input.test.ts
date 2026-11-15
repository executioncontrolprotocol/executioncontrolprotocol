import { describe, expect, it } from "vitest"
import path from "node:path"
import { parseFilters, parseInclude, positionalPathOrId, resolvePath } from "../src/lib/input.js"

describe("cli input helpers", () => {
  it("treats .ecp.json and path separators as paths", () => {
    expect(positionalPathOrId("flows/demo.ecp.json")).toEqual({
      path: resolvePath("flows/demo.ecp.json"),
    })
    expect(positionalPathOrId(`folder${path.sep}x.ecp.json`)).toEqual({
      path: resolvePath(`folder${path.sep}x.ecp.json`),
    })
  })

  it("treats bare tokens as ids", () => {
    expect(positionalPathOrId("my-execution")).toEqual({ id: "my-execution" })
  })

  it("parses filters and rejects bad shapes", () => {
    expect(parseFilters(["a=1", "b=two=parts"])).toEqual({ a: "1", b: "two=parts" })
    expect(parseFilters(undefined)).toBeUndefined()
    expect(() => parseFilters(["novalue"])).toThrow(/ECP_REQUEST_INVALID/)
    expect(() => parseFilters(["=only"])).toThrow(/ECP_REQUEST_INVALID/)
  })

  it("parses include lists", () => {
    expect(parseInclude("a, b ,c")).toEqual(["a", "b", "c"])
    expect(parseInclude(undefined)).toBeUndefined()
    expect(parseInclude("")).toBeUndefined()
  })
})
