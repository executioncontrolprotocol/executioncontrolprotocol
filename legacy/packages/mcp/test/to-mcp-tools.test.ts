import { describe, expect, it } from "vitest"
import { extension } from "@executioncontrolprotocol/core"
import jsonataExtension from "@executioncontrolprotocol/plugin-jsonata"
import { toMcpTools } from "../src/to-mcp-tools.js"
import { testHost } from "./host.js"

describe("toMcpTools", () => {
  it("emits test_echo with a JSON schema and description", async () => {
    const { ecp, host } = await testHost()
    try {
      const tools = toMcpTools(host.registry)
      const echo = tools.find((t) => t.name === "test_echo")
      expect(echo).toBeDefined()
      expect(echo?.capabilityId).toBe("@executioncontrolprotocol/test.echo")
      expect(echo?.description).toMatch(/echo/i)
      expect(echo?.inputSchema).toMatchObject({
        type: "object",
        properties: { value: {} },
      })
    } finally {
      await ecp.terminate()
    }
  })

  it("emits jsonata_transform when the jsonata extension is bound", async () => {
    const { ecp, host } = await testHost([extension(jsonataExtension)])
    try {
      const tools = toMcpTools(host.registry)
      const transform = tools.find((t) => t.name === "jsonata_transform")
      expect(transform).toBeDefined()
      expect(transform?.capabilityId).toBe("@executioncontrolprotocol/jsonata.transform")
      expect(transform?.description).toMatch(/JSONata/i)
      expect(transform?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          expression: { type: "string" },
        },
        required: ["expression", "payload"],
      })
    } finally {
      await ecp.terminate()
    }
  })

  it("does not emit encode or decode root tools", async () => {
    const { ecp, host } = await testHost()
    try {
      const names = toMcpTools(host.registry).map((t) => t.name)
      expect(names).not.toContain("ecp_encode")
      expect(names).not.toContain("ecp_decode")
      expect(names).not.toContain("ecp.encode")
      expect(names).not.toContain("ecp.decode")
    } finally {
      await ecp.terminate()
    }
  })
})
