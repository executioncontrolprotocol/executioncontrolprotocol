import { describe, expect, it } from "vitest"
import {
  environment,
  extension,
  workflow,
  step,
  hook,
  defineExtension,
  testExtension,
} from "../../src/index.js"
import { NODE_ENVIRONMENT_ID, registerNodeEnvironment } from "@executioncontrolprotocol/node"
import { formatToonExtension } from "@executioncontrolprotocol/plugin-format-toon"
import { initEncodingTestEcp } from "../helpers.js"

const sampleManifest = workflow("Weekly Brief")
  .id("weekly-brief")
  .run([
    step("@executioncontrolprotocol/test.echo", "Collect")
      .id("collect")
      .with({ value: "hello" })
      .as("signals"),
  ])
  .toManifest()

describe("ecp.encode/decode", () => {
  it("returns an encode operation builder", async () => {
    const ecp = await initEncodingTestEcp()
    const builder = ecp.encode(sampleManifest)
    expect(builder.uses).toBeTypeOf("function")
    expect(builder.process).toBeTypeOf("function")
    await ecp.terminate()
  })

  it("encodes JSON via @executioncontrolprotocol/format-json", async () => {
    const ecp = await initEncodingTestEcp()
    const encoded = await ecp.encode(sampleManifest).uses("@executioncontrolprotocol/format-json").process()
    expect(encoded.schema).toBe("@executioncontrolprotocol.encode.result")
    expect(encoded.success).toBe(true)
    expect(encoded.format).toBe("json")
    expect(encoded.result).toEqual(sampleManifest)
    await ecp.terminate()
  })

  it("decodes JSON via @executioncontrolprotocol/format-json", async () => {
    const ecp = await initEncodingTestEcp()
    const decoded = await ecp
      .decode(JSON.stringify(sampleManifest))
      .uses("@executioncontrolprotocol/format-json")
      .to("@executioncontrolprotocol.workflow")
      .process()
    expect(decoded.schema).toBe("@executioncontrolprotocol.decode.result")
    expect(decoded.success).toBe(true)
    expect(decoded.result).toEqual(sampleManifest)
    await ecp.terminate()
  })

  it("returns decode diagnostics for invalid JSON instead of throwing", async () => {
    const ecp = await initEncodingTestEcp()
    const decoded = await ecp
      .decode('```json\n{"broken":')
      .uses("@executioncontrolprotocol/format-json")
      .to("@executioncontrolprotocol.workflow")
      .process()
    expect(decoded.success).toBe(false)
    expect(decoded.diagnostics.some((d) => d.message.includes("JSON parse failed"))).toBe(
      true
    )
    await ecp.terminate()
  })

  it("fails when encoder extension is not registered", async () => {
    const ecp = await initEncodingTestEcp()
    await expect(
      ecp.encode(sampleManifest).uses("@executioncontrolprotocol/format-toon").process()
    ).rejects.toThrow(/not registered/)
    await ecp.terminate()
  })

  it("encodes TOON when extension is registered", async () => {
    const ecp = await initEncodingTestEcp([extension(formatToonExtension).with({})])
    const encoded = await ecp
      .encode(sampleManifest)
      .uses("@executioncontrolprotocol/format-toon")
      .to("@executioncontrolprotocol.workflow")
      .process()
    expect(encoded.format).toBe("toon")
    expect(encoded.success).toBe(true)
    expect(String(encoded.result)).toContain("schema: @executioncontrolprotocol.workflow")
    expect(String(encoded.result)).toContain("steps[")
    await ecp.terminate()
  })
})

describe("encode/decode lifecycle isolation", () => {
  it("does not emit run or step lifecycle during encode/decode", async () => {
    const events: string[] = []
    const spy = defineExtension("@executioncontrolprotocol", "telemetry-spy")
      .withHooks([
        hook("run:before", async () => {
          events.push("run:before")
        }),
        hook("step:before", async () => {
          events.push("step:before")
        }),
      ])
      .build()

    const ecp = await initEncodingTestEcp([
      extension(spy).with({}),
      extension(formatToonExtension).with({}),
    ])

    const toon = await ecp.encode(sampleManifest).uses("@executioncontrolprotocol/format-toon").process()
    expect(toon.success).toBe(true)
    await ecp.decode(toon.result).uses("@executioncontrolprotocol/format-toon").process()

    expect(events).not.toContain("run:before")
    expect(events).not.toContain("step:before")
    await ecp.terminate()
  })
})

describe("env.init", () => {
  it("initializes an Ecp operational instance", async () => {
    await registerNodeEnvironment()
    const env = environment(NODE_ENVIRONMENT_ID, "test").with([
      extension(testExtension).with({}),
    ])
    const ecp = await env.init()
    expect(ecp.encode).toBeTypeOf("function")
    expect(ecp.decode).toBeTypeOf("function")
    expect(ecp.patch).toBeTypeOf("function")
    expect(ecp.run).toBeTypeOf("function")
    expect(ecp.terminate).toBeTypeOf("function")
    await ecp.terminate()
  })
})
