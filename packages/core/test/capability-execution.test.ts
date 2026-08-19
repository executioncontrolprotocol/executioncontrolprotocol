import { describe, expect, it } from "vitest"
import {
  BROWSER_RUNTIME_ID,
  NODE_RUNTIME_ID,
  resolveCapabilityExecution,
} from "../src/index.js"

describe("resolveCapabilityExecution", () => {
  it("uses an explicit capability declaration", () => {
    expect(
      resolveCapabilityExecution({ execution: "mixed" }, { supportedRuntimes: [NODE_RUNTIME_ID] })
    ).toBe("mixed")
  })

  it("defaults node-only extensions to host", () => {
    expect(resolveCapabilityExecution({}, { supportedRuntimes: [NODE_RUNTIME_ID] })).toBe("host")
  })

  it("defaults browser-only extensions to local", () => {
    expect(resolveCapabilityExecution({}, { supportedRuntimes: [BROWSER_RUNTIME_ID] })).toBe(
      "local"
    )
  })

  it("defaults unrestricted extensions to local", () => {
    expect(resolveCapabilityExecution({}, {})).toBe("local")
    expect(resolveCapabilityExecution({}, { supportedRuntimes: [NODE_RUNTIME_ID, BROWSER_RUNTIME_ID] })).toBe(
      "local"
    )
  })
})
