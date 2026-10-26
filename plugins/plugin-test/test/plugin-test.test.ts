import { describe, expect, it } from "vitest"
import { Registry, environment, extension, testExtension } from "@executioncontrolprotocol/core"
import { NODE_ENVIRONMENT_ID, registerNodeEnvironment } from "@executioncontrolprotocol/node"
import pluginTest from "../src/index.js"

type Handler = (input: unknown, ctx: unknown) => Promise<unknown>

function capability(id: string): Handler {
  const cap = pluginTest.capabilities.find((c) => c.id === id)
  if (!cap) throw new Error(`missing capability ${id}`)
  return cap.handler as Handler
}

const ctx = {
  extensionConfig: {},
  usage: { increment: () => undefined },
}

describe("@executioncontrolprotocol/plugin-test", () => {
  it("re-exports the core test extension as the default", () => {
    expect(pluginTest).toBe(testExtension)
    expect(pluginTest.id).toBe("@executioncontrolprotocol/test")
  })

  it("registers echo and stubs, not generate", async () => {
    const registry = new Registry()
    await registry.registerExtension(pluginTest)
    const ext = registry.getExtension("@executioncontrolprotocol/test")
    expect(ext).toBe(pluginTest)
    const ids = ext?.capabilities.map((c) => c.id) ?? []
    expect(ids).toContain("@executioncontrolprotocol/test.echo")
    expect(ids).toContain("@executioncontrolprotocol/test.summarize")
    expect(ids).toContain("@executioncontrolprotocol/test.translate")
    expect(ids).toContain("@executioncontrolprotocol/test.notify")
    expect(ids).toContain("@executioncontrolprotocol/test.validate")
    expect(ids).not.toContain("@executioncontrolprotocol/test.generate")
  })

  it("echo returns the supplied value", async () => {
    const out = (await capability("@executioncontrolprotocol/test.echo")(
      { value: "hello" },
      ctx
    )) as { echo: unknown }
    expect(out).toEqual({ echo: "hello" })
  })

  it("echo uses the default greeting when value is omitted", async () => {
    const out = (await capability("@executioncontrolprotocol/test.echo")({}, ctx)) as {
      echo: unknown
    }
    expect(out).toEqual({ echo: "hi" })
  })

  it("rejects an unknown capability id on the extension", () => {
    expect(pluginTest.capabilities.find((c) => c.id === "@executioncontrolprotocol/test.generate")).toBeUndefined()
  })

  it("invoke fails when the host has not bound the plugin", async () => {
    await registerNodeEnvironment()
    const ecp = await environment(NODE_ENVIRONMENT_ID, "bare-plugin-test").init()
    try {
      const result = await ecp
        .invoke("@executioncontrolprotocol/test.echo")
        .with({ value: "nope" })
        .process()
      expect(result.success).toBe(false)
    } finally {
      await ecp.terminate()
    }
  })

  it("invoke succeeds when the plugin is bound", async () => {
    await registerNodeEnvironment()
    const ecp = await environment(NODE_ENVIRONMENT_ID, "bound-plugin-test")
      .with([extension(pluginTest)])
      .init()
    try {
      const result = await ecp
        .invoke("@executioncontrolprotocol/test.echo")
        .with({ value: "bound" })
        .process()
      expect(result.success).toBe(true)
      expect(result.result).toEqual({ echo: "bound" })
    } finally {
      await ecp.terminate()
    }
  })
})
