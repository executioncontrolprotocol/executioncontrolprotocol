import { describe, expect, it } from "vitest"
import { unwrapAdobeResult } from "../src/runtime/invoke.js"

describe("unwrapAdobeResult", () => {
  it("returns the inner result object from a succeeded Firefly job", () => {
    const outputs = [{ seed: 1, image: { url: "https://cdn.example/out.png" } }]
    expect(
      unwrapAdobeResult({
        status: "succeeded",
        jobId: "ff-1",
        result: { outputs },
      }),
    ).toEqual({ outputs })
  })

  it("returns a body with no result as-is", () => {
    const list = { documents: [{ id: "d1", name: "Poster", thumbnailUrl: "https://x" }] }
    expect(unwrapAdobeResult(list)).toEqual(list)
  })

  it("leaves arrays and non-objects unchanged", () => {
    expect(unwrapAdobeResult([{ id: 1 }])).toEqual([{ id: 1 }])
    expect(unwrapAdobeResult("ok")).toBe("ok")
    expect(unwrapAdobeResult(null)).toBeNull()
    expect(unwrapAdobeResult(undefined)).toBeUndefined()
  })

  it("does not unwrap a non-object result field", () => {
    expect(unwrapAdobeResult({ status: "succeeded", result: "done" })).toEqual({
      status: "succeeded",
      result: "done",
    })
    expect(unwrapAdobeResult({ result: [{ url: "https://x" }] })).toEqual({
      result: [{ url: "https://x" }],
    })
  })
})
