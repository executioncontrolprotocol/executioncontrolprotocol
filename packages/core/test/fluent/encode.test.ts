import { describe, expect, it } from "vitest"
import {
  workflow,
  step,
  ref,
  normalizeWorkflowManifest,
  renderWorkflowToFluent,
  encodeFluent,
} from "../../src/index.js"
import { compileWorkflowSource } from "../../src/compile/index.js"
import { ECP_FORMATS } from "@executioncontrolprotocol/core/types"
import { initEncodingTestEcp } from "../helpers.js"

describe("renderWorkflowToFluent", () => {
  it("renders workflow manifest to Fluent API source", () => {
    const manifest = workflow("Weekly Brief")
      .id("weekly-brief")
      .run([
        step("@executioncontrolprotocol/test.echo", "Collect")
          .id("collect")
          .with({ value: "q" })
          .as("signals"),
      ])
      .toManifest()

    const source = renderWorkflowToFluent(manifest)
    expect(source).toContain("export default workflow")
    expect(source).toContain("step(")
    expect(source).toContain('.id("collect")')
  })

  it("generated Fluent source compiles back to manifest", async () => {
    const manifest = workflow("W")
      .run([
        step("@executioncontrolprotocol/test.echo", "E")
          .with({ value: ref("signals.results") })
          .as("o"),
      ])
      .toManifest()

    const source = renderWorkflowToFluent(manifest)
    expect(source).toContain('ref("signals.results")')

    const compiled = await compileWorkflowSource({
      source,
      filename: "generated.workflow.ts",
    })

    expect(compiled.ok).toBe(true)
    expect(normalizeWorkflowManifest(compiled.manifest!)).toEqual(
      normalizeWorkflowManifest(manifest)
    )
  })

  it("toFluentSource on builder matches renderWorkflowToFluent", () => {
    const builder = workflow("Echo").run([
      step("@executioncontrolprotocol/test.echo", "E").with({ value: "x" }).as("o"),
    ])
    expect(builder.toFluentSource()).toBe(renderWorkflowToFluent(builder.toManifest()))
  })

  it("pretty-prints accepts and returns schemas across multiple lines", async () => {
    const manifest = workflow("Round")
      .id("round")
      .accepts({
        type: "object",
        properties: {
          prompt: { type: "string", minLength: 3 },
          mode: { type: "string", enum: ["fast", "slow"] },
        },
        required: ["prompt"],
      })
      .returns({
        type: "object",
        properties: { echo: { type: "object" } },
        required: ["echo"],
      })
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "x" }).as("echo")])
      .toManifest()

    const source = renderWorkflowToFluent(manifest)
    expect(source).toMatch(/\.accepts\(\{\n/)
    expect(source).toMatch(/\.returns\(\{\n/)
    expect(source).toContain('"minLength": 3')
    expect(source).toContain('"enum": [')
    expect(source).toContain('"fast"')
    expect(source).toContain('"slow"')

    const compact = renderWorkflowToFluent(manifest, { compact: true })
    expect(compact).toContain('.accepts({"type":"object"')
    expect(compact).not.toMatch(/\.accepts\(\{\n/)

    const compiled = await compileWorkflowSource({
      source,
      filename: "pretty-accepts-returns.workflow.ts",
    })
    expect(compiled.ok, compiled.compileErrors?.map((e) => e.message).join("; ")).toBe(true)
    expect(compiled.manifest?.workflow.accepts).toEqual(manifest.workflow.accepts)
    expect(compiled.manifest?.workflow.returns).toEqual(manifest.workflow.returns)
  })
})

describe("encodeFluent", () => {
  it("returns EncodeResult with fluent format", () => {
    const manifest = workflow("Echo")
      .run([step("@executioncontrolprotocol/test.echo", "E").with({ value: "x" }).as("o")])
      .toManifest()

    const encoded = encodeFluent(manifest)
    expect(encoded.success).toBe(true)
    expect(encoded.format).toBe(ECP_FORMATS.FLUENT)
    expect(String(encoded.result)).toContain("export default workflow")
  })
})

describe("env.encode built-in fluent", () => {
  it("encodes via @executioncontrolprotocol/format-fluent", async () => {
    const manifest = workflow("Echo")
      .run([step("@executioncontrolprotocol/test.echo", "E").with({ value: "x" }).as("o")])
      .toManifest()

    const ecp = await initEncodingTestEcp()
    const encoded = await ecp.encode(manifest).uses("@executioncontrolprotocol/format-fluent").process()
    await ecp.terminate()

    expect(encoded.success).toBe(true)
    expect(encoded.format).toBe("fluent")
  })
})
