import { describe, expect, it } from "vitest"
import { z } from "zod"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  jsonSchemaFromZod,
  jsonSchemaObjectProperties,
  pickWorkflowReturns,
  validateAgainstJsonSchema,
  workflow,
  step,
  renderWorkflowToFluent,
  validateWorkflowAcceptsInput,
  normalizeWorkflowManifest,
} from "../src/index.js"
import { compileWorkflowSource } from "../src/compile/index.js"
import { initTestEcp } from "./helpers.js"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..")

describe("workflow accepts / returns", () => {
  it("projects Zod objects onto workflow.accepts and workflow.returns", () => {
    const manifest = workflow("Weekly brief")
      .id("weekly-brief")
      .accepts(z.object({ prompt: z.string() }))
      .returns(z.object({ echo: z.object({ echo: z.string() }).optional() }))
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("echo")])
      .toManifest()

    expect(manifest.workflow.accepts).toEqual({
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
    })
    expect(manifest.workflow.returns?.properties).toMatchObject({
      echo: { type: "object" },
    })
  })

  it("omits empty object schemas", () => {
    const manifest = workflow("Empty")
      .accepts(z.object({}))
      .run([])
      .toManifest()
    expect(manifest.workflow.accepts).toBeUndefined()
  })

  it("accepts JSON Schema records in Fluent", () => {
    const schema = { type: "object", properties: { n: { type: "number" } }, required: ["n"] }
    const manifest = workflow("Json")
      .accepts(schema)
      .run([])
      .toManifest()
    expect(manifest.workflow.accepts).toEqual(schema)
  })

  it("renders .accepts / .returns verbs that compile back", async () => {
    const manifest = workflow("Round")
      .id("round")
      .accepts(z.object({ prompt: z.string() }))
      .returns(z.object({ echo: z.unknown().optional() }))
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "x" }).as("echo")])
      .toManifest()

    const source = renderWorkflowToFluent(manifest)
    expect(source).toContain(".accepts(")
    expect(source).toContain(".returns(")
    expect(source).not.toContain("from \"zod\"")

    const compiled = await compileWorkflowSource({
      source,
      filename: "accepts-returns.workflow.ts",
    })
    expect(compiled.ok, compiled.compileErrors?.map((e) => e.message).join("; ")).toBe(true)
    expect(compiled.manifest?.workflow.accepts).toEqual(manifest.workflow.accepts)
    expect(compiled.manifest?.workflow.returns).toEqual(manifest.workflow.returns)
  })

  it("compiles examples/07-accepts-returns workflow source", async () => {
    const source = await readFile(join(repoRoot, "examples/07-accepts-returns/workflow.ts"), "utf8")
    const compiled = await compileWorkflowSource({
      source,
      filename: "examples/07-accepts-returns/workflow.ts",
    })
    expect(compiled.ok, compiled.compileErrors?.map((e) => e.message).join("; ")).toBe(true)
    expect(compiled.manifest?.workflow.accepts).toMatchObject({
      type: "object",
      properties: { value: { type: "string" } },
    })
    expect(compiled.manifest?.workflow.returns).toMatchObject({
      type: "object",
      properties: { echo: { type: "object" } },
    })
  })

  it("validates run input against accepts", () => {
    const manifest = workflow("Need prompt")
      .accepts(z.object({ prompt: z.string() }))
      .run([])
      .toManifest()
    expect(validateWorkflowAcceptsInput(manifest, {}).ok).toBe(false)
    expect(validateWorkflowAcceptsInput(manifest, { prompt: "hi" }).ok).toBe(true)
    expect(validateWorkflowAcceptsInput(manifest, { prompt: 1 }).ok).toBe(false)
  })

  it("patches workflow.accepts and preserves it in normalize", async () => {
    const ecp = await initTestEcp("test", "Test")
    const manifest = workflow("Patch io")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "x" }).as("echo")])
      .toManifest()
    const schema = {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
    }
    const patched = await ecp
      .patch(manifest)
      .with([{ path: "workflow.accepts", mode: "replace", value: schema }])
      .process()
    expect(patched.success).toBe(true)
    const next = patched.result as typeof manifest
    expect(next.workflow.accepts).toEqual(schema)
    expect(normalizeWorkflowManifest(next).workflow.accepts).toEqual(schema)
    await ecp.terminate()
  })

  it("allows a run with no input when accepts is omitted", async () => {
    const ecp = await initTestEcp("test", "Test")
    const manifest = workflow("No io")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "x" }).as("echo")])
      .toManifest()
    expect(validateWorkflowAcceptsInput(manifest, undefined).ok).toBe(true)
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("completed")
    expect(result.output).toBeUndefined()
    await ecp.terminate()
  })

  it("picks returns from state and fails run when required output is missing", async () => {
    const ecp = await initTestEcp("test", "Test")
    const ok = workflow("Echo out")
      .returns(z.object({ echo: z.object({ echo: z.string() }) }))
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hello" }).as("echo")])
      .toManifest()
    const result = await ecp.run(ok)
    expect(result.run.status).toBe("completed")
    expect(result.output?.echo).toEqual({ echo: "hello" })

    const missing = workflow("Missing out")
      .returns(z.object({ nope: z.string() }))
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hello" }).as("echo")])
      .toManifest()
    const failed = await ecp.run(missing)
    expect(failed.run.status).toBe("failed")
    expect(failed.output).toEqual({})
    await ecp.terminate()
  })

  it("rejects run when accepts input is missing", async () => {
    const ecp = await initTestEcp("test", "Test")
    const manifest = workflow("Needs input")
      .accepts(z.object({ prompt: z.string() }))
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "x" }).as("echo")])
      .toManifest()
    await expect(ecp.run(manifest)).rejects.toThrow(/accepts validation failed/)
    const result = await ecp.run(manifest, { input: { prompt: "ok" } })
    expect(result.run.status).toBe("completed")
    await ecp.terminate()
  })
})

describe("jsonSchema helpers", () => {
  it("projects enums, arrays, and literals", () => {
    expect(jsonSchemaFromZod(z.enum(["a", "b"]))).toEqual({ type: "string", enum: ["a", "b"] })
    expect(jsonSchemaFromZod(z.array(z.string()))).toEqual({ type: "array", items: { type: "string" } })
    expect(jsonSchemaFromZod(z.literal("x"))).toEqual({ type: "string", enum: ["x"] })
    expect(jsonSchemaFromZod(z.boolean().optional())).toEqual({ type: "boolean" })
  })

  it("lists object properties and required flags", () => {
    const schema = jsonSchemaFromZod(z.object({ a: z.string(), b: z.number().optional() }))
    expect(jsonSchemaObjectProperties(schema)).toEqual([
      { name: "a", schema: { type: "string" }, required: true },
      { name: "b", schema: { type: "number" }, required: false },
    ])
  })

  it("validates integer and object values", () => {
    expect(validateAgainstJsonSchema({ type: "object", properties: { n: { type: "integer" } }, required: ["n"] }, { n: 1 }).ok).toBe(true)
    expect(validateAgainstJsonSchema({ type: "object", properties: { n: { type: "integer" } }, required: ["n"] }, { n: 1.5 }).ok).toBe(false)
    expect(validateAgainstJsonSchema({ type: "object", properties: { o: { type: "object" } } }, { o: [] }).ok).toBe(false)
    expect(validateAgainstJsonSchema({ type: "string" }, 1).ok).toBe(false)
  })

  it("picks listed state keys", () => {
    expect(pickWorkflowReturns({ type: "object", properties: { a: { type: "string" } } }, { a: 1, b: 2 })).toEqual({
      a: 1,
    })
    expect(pickWorkflowReturns(undefined, { a: 1 })).toBeUndefined()
    expect(
      validateAgainstJsonSchema(
        {
          type: "object",
          properties: { a: { type: "array" }, b: { type: "boolean" }, c: { type: "null" } },
        },
        { a: [], b: true, c: null }
      ).ok
    ).toBe(true)
  })
})
