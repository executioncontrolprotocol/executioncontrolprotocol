import { describe, expect, it } from "vitest"
import {
  buildDemoOpenUrl,
  demoEnvPresetFromEnvPath,
  originFromUrl,
} from "../../src/lib/up/open-browser.js"
import { DEFAULT_DEMO_OPEN_URL } from "../../src/lib/up/constants.js"

describe("demoEnvPresetFromEnvPath", () => {
  it("defaults when no env path", () => {
    expect(demoEnvPresetFromEnvPath(undefined)).toBe("default")
  })

  it("maps paths containing extended to extended", () => {
    expect(demoEnvPresetFromEnvPath("apps/browser-demo/host/environment-extended.ts")).toBe(
      "extended"
    )
    expect(demoEnvPresetFromEnvPath("C:\\env\\extended\\environment.ts")).toBe("extended")
  })

  it("maps the default host env to default", () => {
    expect(demoEnvPresetFromEnvPath("apps/browser-demo/host/environment.ts")).toBe("default")
  })
})

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

  it("adds env preset when provided", () => {
    const url = buildDemoOpenUrl(DEFAULT_DEMO_OPEN_URL, {
      token: "abc-123",
      env: "default",
    })
    expect(new URL(url).searchParams.get("env")).toBe("default")
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
