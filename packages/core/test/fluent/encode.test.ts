import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
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
import { ECP_FORMATS, type WorkflowManifest } from "@executioncontrolprotocol/types"
import { initEncodingTestEcp } from "../helpers.js"

const workflowFixturesRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../harnesses/browser-nano/fixtures/workflows"
)

describe("renderWorkflowToFluent", () => {
  it("renders workflow manifest to Fluent API source", () => {
    const manifest = workflow("Weekly Brief")
      .id("weekly-brief")
      .run([
        step("@executioncontrolprotocol/memory.search", "Collect")
          .id("collect")
          .with({ query: "q" })
          .as("signals"),
      ])
      .toManifest()

    const source = renderWorkflowToFluent(manifest)
    expect(source).toContain("export default workflow")
    expect(source).toContain("step(")
    expect(source).toContain('.id("collect")')
  })

  it("renders echo-workflow with stable step .id for coding patch baselines", () => {
    const raw = readFileSync(path.join(workflowFixturesRoot, "echo-workflow.json"), "utf8")
    const manifest = JSON.parse(raw) as WorkflowManifest
    const source = renderWorkflowToFluent(manifest)
    expect(source).toContain('.id("echo")')
    expect(source).toContain('.id("echo-test")')
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
