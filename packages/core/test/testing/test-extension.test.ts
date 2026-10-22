import { describe, expect, it } from "vitest"
import {
  environment,
  extension,
  registerTestExtension,
  runtime,
  testExtension,
} from "@executioncontrolprotocol/core"
import { NODE_RUNTIME_ID, registerNodeRuntime } from "@executioncontrolprotocol/node"

describe("@executioncontrolprotocol/test", () => {
  it("registers echo and stubs, not generate", async () => {
    await registerTestExtension()
    const ids = testExtension.capabilities.map((c) => c.id)
    expect(ids).toContain("@executioncontrolprotocol/test.echo")
    expect(ids).toContain("@executioncontrolprotocol/test.summarize")
    expect(ids).not.toContain("@executioncontrolprotocol/test.generate")
  })

  it("echo invoke returns the supplied value", async () => {
    await registerNodeRuntime()
    await registerTestExtension()
    const env = environment("test-echo")
      .withRuntime(runtime(NODE_RUNTIME_ID))
      .withExtensions([extension("@executioncontrolprotocol/test").with({})])
    const ecp = await env.init()
    const result = await ecp.invoke("@executioncontrolprotocol/test.echo").with({ value: "hello" }).process()
    expect(result.success).toBe(true)
    expect(result.result).toEqual({ echo: "hello" })
    await ecp.terminate()
  })

  it("echo invoke uses the default greeting when value is omitted", async () => {
    await registerNodeRuntime()
    await registerTestExtension()
    const env = environment("test-echo-default")
      .withRuntime(runtime(NODE_RUNTIME_ID))
      .withExtensions([extension("@executioncontrolprotocol/test").with({})])
    const ecp = await env.init()
    const result = await ecp.invoke("@executioncontrolprotocol/test.echo").with({}).process()
    expect(result.success).toBe(true)
    expect(result.result).toEqual({ echo: "hi" })
    await ecp.terminate()
  })
})
