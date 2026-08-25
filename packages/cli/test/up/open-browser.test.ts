import { describe, expect, it } from "vitest"
import { buildDemoOpenUrl, originFromUrl } from "../../src/lib/up/open-browser.js"
import { DEFAULT_DEMO_OPEN_URL } from "../../src/lib/up/constants.js"

describe("buildDemoOpenUrl", () => {
  it("adds token and bridge query params", () => {
    const url = buildDemoOpenUrl(DEFAULT_DEMO_OPEN_URL, {
      token: "abc-123",
      bridgeBaseURL: "http://127.0.0.1:3090",
    })
    const parsed = new URL(url)
    expect(parsed.origin).toBe("https://demo.executioncontrolprotocol.io")
    expect(parsed.pathname).toBe("/")
    expect(parsed.searchParams.get("token")).toBe("abc-123")
    expect(parsed.searchParams.get("bridge")).toBe("http://127.0.0.1:3090")
  })
})

describe("originFromUrl", () => {
  it("returns the origin for CORS allowlisting", () => {
    expect(originFromUrl(DEFAULT_DEMO_OPEN_URL)).toBe(
      "https://demo.executioncontrolprotocol.io"
    )
  })

  it("returns undefined for invalid URLs", () => {
    expect(originFromUrl("not a url")).toBeUndefined()
  })
})
