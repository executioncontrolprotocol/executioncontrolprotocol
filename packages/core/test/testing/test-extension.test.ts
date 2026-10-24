import { describe, expect, it } from "vitest"
import {
  environment,
  extension,
  testExtension,
} from "@executioncontrolprotocol/core"
import { NODE_ENVIRONMENT_ID, registerNodeEnvironment } from "@executioncontrolprotocol/node"

describe("@executioncontrolprotocol/test", () => {
  it("registers echo and stubs, not generate", async () => {
    const ids = testExtension.capabilities.map((c) => c.id)
    expect(ids).toContain("@executioncontrolprotocol/test.echo")
    expect(ids).toContain("@executioncontrolprotocol/test.summarize")
    expect(ids).not.toContain("@executioncontrolprotocol/test.generate")
  })

  it("echo invoke returns the supplied value", async () => {
    await registerNodeEnvironment()
    const env = environment(NODE_ENVIRONMENT_ID, "test-echo").with([
      extension(testExtension).with({}),
    ])
    const ecp = await env.init()
    const result = await ecp.invoke("@executioncontrolprotocol/test.echo").with({ value: "hello" }).process()
    expect(result.success).toBe(true)
    expect(result.result).toEqual({ echo: "hello" })
    await ecp.terminate()
  })

  it("echo invoke uses the default greeting when value is omitted", async () => {
    await registerNodeEnvironment()
    const env = environment(NODE_ENVIRONMENT_ID, "test-echo-default").with([
      extension(testExtension).with({}),
    ])
    const ecp = await env.init()
    const result = await ecp.invoke("@executioncontrolprotocol/test.echo").with({}).process()
    expect(result.success).toBe(true)
    expect(result.result).toEqual({ echo: "hi" })
    await ecp.terminate()
  })
})
