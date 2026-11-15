import { describe, expect, it } from "vitest"
import { ECP_PLUGINS_MISSING, isEcpError } from "@executioncontrolprotocol/core/types"
import { applyFormat, formatExtensionId } from "../src/format.js"
import { testHost } from "./host.js"

describe("format helpers", () => {
  it("maps short tokens to format-extension ids", () => {
    expect(formatExtensionId("toon")).toBe("@executioncontrolprotocol/format-toon")
    expect(formatExtensionId("format-toon")).toBe("@executioncontrolprotocol/format-toon")
    expect(formatExtensionId("@executioncontrolprotocol/format-toon")).toBe(
      "@executioncontrolprotocol/format-toon"
    )
  })

  it("returns data unchanged when format is omitted", async () => {
    const { ecp } = await testHost()
    try {
      expect(await applyFormat(ecp, { a: 1 }, undefined)).toEqual({ a: 1 })
    } finally {
      await ecp.terminate()
    }
  })

  it("throws ECP_PLUGINS_MISSING when the format plugin is not installed", async () => {
    const { ecp } = await testHost()
    try {
      await expect(applyFormat(ecp, { a: 1 }, "toon")).rejects.toSatisfy((err: unknown) => {
        return isEcpError(err) && err.code === ECP_PLUGINS_MISSING
      })
    } finally {
      await ecp.terminate()
    }
  })
})
