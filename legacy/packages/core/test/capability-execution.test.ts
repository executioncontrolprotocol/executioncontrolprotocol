import { describe, expect, it } from "vitest"
import {
  BROWSER_ENVIRONMENT_ID,
  NODE_ENVIRONMENT_ID,
  resolveCapabilityExecution,
} from "../src/index.js"

describe("resolveCapabilityExecution", () => {
  it("uses an explicit capability declaration", () => {
    expect(
      resolveCapabilityExecution({ execution: "mixed" }, { supportedEnvironments: [{ id: NODE_ENVIRONMENT_ID }] })
    ).toBe("mixed")
  })

  it("defaults node-only extensions to host", () => {
    expect(resolveCapabilityExecution({}, { supportedEnvironments: [{ id: NODE_ENVIRONMENT_ID }] })).toBe("host")
  })

  it("defaults browser-only extensions to local", () => {
    expect(resolveCapabilityExecution({}, { supportedEnvironments: [{ id: BROWSER_ENVIRONMENT_ID }] })).toBe(
      "local"
    )
  })

  it("defaults unrestricted extensions to host", () => {
    expect(resolveCapabilityExecution({}, {})).toBe("host")
    expect(
      resolveCapabilityExecution(
        {},
        { supportedEnvironments: [{ id: NODE_ENVIRONMENT_ID }, { id: BROWSER_ENVIRONMENT_ID }] }
      )
    ).toBe("host")
  })
})
