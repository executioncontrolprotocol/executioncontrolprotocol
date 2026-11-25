import { describe, expect, it } from "vitest"
import {
  CAPABILITY_LIST_LIMIT,
  CAPABILITY_SEARCH_LIMIT,
  capabilityRetrieveInput,
  isLatestCapabilityRequest,
} from "../../src/web/lib/capability-search.js"

describe("capabilityRetrieveInput", () => {
  it("lists when query is empty or whitespace", () => {
    expect(capabilityRetrieveInput("")).toEqual({ type: "capability", limit: CAPABILITY_LIST_LIMIT })
    expect(capabilityRetrieveInput("  ")).toEqual({ type: "capability", limit: CAPABILITY_LIST_LIMIT })
  })

  it("searches when query is non-empty", () => {
    expect(capabilityRetrieveInput(" echo ")).toEqual({
      type: "capability",
      query: "echo",
      limit: CAPABILITY_SEARCH_LIMIT,
    })
  })
})

describe("isLatestCapabilityRequest", () => {
  it("compares request ids", () => {
    expect(isLatestCapabilityRequest(2, 2)).toBe(true)
    expect(isLatestCapabilityRequest(1, 2)).toBe(false)
  })
})