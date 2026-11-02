import { describe, expect, it } from "vitest"
import { detailsFromThrown } from "../../src/runtime/error-details.js"

class HttpErr extends Error {
  status = 400
  bodyText = '{"error":"bad"}'
  url = "https://example.test/v1/jobs"
  output = { partial: true }

  constructor() {
    super("HTTP 400 for https://example.test/v1/jobs")
    this.name = "HttpErr"
  }
}

describe("detailsFromThrown", () => {
  it("copies JSON-safe own properties and name, omitting stack", () => {
    const fields = detailsFromThrown(new HttpErr())
    expect(fields.details).toEqual({
      name: "HttpErr",
      status: 400,
      bodyText: '{"error":"bad"}',
      url: "https://example.test/v1/jobs",
    })
    expect(fields.details).not.toHaveProperty("stack")
    expect(fields.output).toEqual({ partial: true })
  })

  it("returns empty for a plain Error", () => {
    const err = new Error("boom")
    const fields = detailsFromThrown(err)
    expect(fields.details).toEqual({ name: "Error" })
    expect(fields.output).toBeUndefined()
  })

  it("returns empty for non-objects", () => {
    expect(detailsFromThrown("nope")).toEqual({})
    expect(detailsFromThrown(undefined)).toEqual({})
  })

  it("copies nested objects and arrays and drops functions", () => {
    const err = Object.assign(new Error("nested"), {
      name: "NestedErr",
      headers: { accept: "application/json" },
      items: [1, () => 2, "ok"],
      skip: () => undefined,
    })
    const fields = detailsFromThrown(err)
    expect(fields.details).toEqual({
      name: "NestedErr",
      headers: { accept: "application/json" },
      items: [1, "ok"],
    })
  })

  it("omits cyclic own properties", () => {
    const err = new Error("cycle")
    err.name = "CycleErr"
    const cycle: Record<string, unknown> = { ok: true }
    cycle.self = cycle
    Object.assign(err, { cycle })
    const fields = detailsFromThrown(err)
    expect(fields.details?.name).toBe("CycleErr")
    expect(fields.details?.cycle).toEqual({ ok: true })
  })
})
