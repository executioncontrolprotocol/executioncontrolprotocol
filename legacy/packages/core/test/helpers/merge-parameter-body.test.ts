import { describe, expect, it } from "vitest"
import { ECP_INPUT_INVALID, EcpError } from "../../src/types/index.js"
import { mergeParameterBody } from "../../src/helpers/merge-parameter-body.js"

describe("mergeParameterBody", () => {
  it("uses parameters alone as the object", () => {
    expect(mergeParameterBody(undefined, { prompt: "sunset" })).toEqual({ prompt: "sunset" })
  })

  it("overrides a body key and keeps body-only keys", () => {
    expect(
      mergeParameterBody({ prompt: "from-body", seeds: [1] }, { prompt: "from-param" })
    ).toEqual({ prompt: "from-param", seeds: [1] })
  })

  it("replaces nested objects as a whole", () => {
    expect(
      mergeParameterBody({ style: { a: 1, b: 2 } }, { style: { a: 9 } })
    ).toEqual({ style: { a: 9 } })
  })

  it("rejects a non-object body when parameters are set", () => {
    expect(() => mergeParameterBody(["a"], { prompt: "x" })).toThrow(EcpError)
    try {
      mergeParameterBody("raw", { prompt: "x" })
    } catch (err) {
      expect(err).toBeInstanceOf(EcpError)
      expect((err as EcpError).code).toBe(ECP_INPUT_INVALID)
      return
    }
    expect.fail("expected EcpError")
  })

  it("leaves an omitted parameter's body key in place", () => {
    expect(mergeParameterBody({ prompt: "keep", seeds: [2] }, {})).toEqual({
      prompt: "keep",
      seeds: [2],
    })
    expect(
      mergeParameterBody({ prompt: "keep", seeds: [2] }, { seeds: undefined })
    ).toEqual({
      prompt: "keep",
      seeds: [2],
    })
  })

  it("returns a non-object body when no parameters are set", () => {
    expect(mergeParameterBody(["a"], {})).toEqual(["a"])
  })

  it("returns undefined when neither body nor parameters are set", () => {
    expect(mergeParameterBody(undefined, {})).toBeUndefined()
  })
})
