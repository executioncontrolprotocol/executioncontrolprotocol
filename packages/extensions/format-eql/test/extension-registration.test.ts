import { describe, expect, it } from "vitest"
import { globalRegistry } from "@executioncontrolprotocol/core"
import { formatEqlExtension, registerFormatEqlExtension } from "../src/index.js"

describe("registerFormatEqlExtension", () => {
  it("catalogs encode and decode capabilities", () => {
    expect(formatEqlExtension.id).toBe("@executioncontrolprotocol/format-eql")
    const caps = formatEqlExtension.capabilities.map((c) => c.id)
    expect(caps).toContain("@executioncontrolprotocol/format-eql.encode")
    expect(caps).toContain("@executioncontrolprotocol/format-eql.decode")
  })

  it("registers on the global registry", async () => {
    await registerFormatEqlExtension()
    expect(globalRegistry.getExtension("@executioncontrolprotocol/format-eql")).toBeDefined()
    await registerFormatEqlExtension()
  })
})
