import { describe, expect, it } from "vitest"
import { extension } from "../src/index.js"
import { createTestEnvironment } from "./helpers.js"

describe("environment.search", () => {
  it("ranks multi-token queries", async () => {
    const env = (await createTestEnvironment("s")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])

    const ecp = await env.init()
    const result = await ecp.search("test echo")
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0]?.id).toBe("@executioncontrolprotocol/test.echo")
    expect(result.results[0]?.score).toBeGreaterThan(0)
  })

  it("does not attach schemas on light search results", async () => {
    const env = (await createTestEnvironment("s")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])

    const ecp = await env.init()
    const result = await ecp.search("echo", {
      include: ["inputSchema"],
    })
    expect(result.results[0]?.id).toBe("@executioncontrolprotocol/test.echo")
    expect(result.results[0]?.inputSchema).toBeUndefined()
  })
})
