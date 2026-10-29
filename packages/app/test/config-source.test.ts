import { describe, expect, it } from "vitest"
import { CONFIG_EDITOR_PATH, configFilename } from "../src/host/config-source.js"

describe("configFilename", () => {
  it("defaults to config.ecp.ts when the path is missing", () => {
    expect(configFilename(undefined)).toBe("config.ecp.ts")
    expect(configFilename("")).toBe("config.ecp.ts")
  })

  it("returns the basename from posix and windows paths", () => {
    expect(configFilename("/home/me/.ecp/config/config.ecp.ts")).toBe("config.ecp.ts")
    expect(configFilename("C:\\Users\\me\\.ecp\\config\\custom.ecp.ts")).toBe("custom.ecp.ts")
  })

  it("exports the Config tab Monaco path", () => {
    expect(CONFIG_EDITOR_PATH).toBe("file:///ecp-workflow/config.ecp.ts")
  })
})
