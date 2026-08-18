import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  workflow,
  step,
  ref,
  validateWorkflowAcceptsInput,
  validateAgainstJsonSchema,
  jsonSchemaFromZod,
} from "../src/index.js"
import { initTestEcp } from "./helpers.js"

function echoFromInputManifest() {
  return workflow("Echo from input")
    .id("echo-from-input")
    .accepts({
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    })
    .returns({
      type: "object",
      properties: { echo: { type: "object" } },
      required: ["echo"],
    })
    .run([
      step("@executioncontrolprotocol/test.echo", "Echo")
        .with({ value: ref("value") })
        .as("echo"),
    ])
    .toManifest()
}

describe("accepts gate (positive)", () => {
  it("accepts a required string and completes the run", async () => {
    const ecp = await initTestEcp("accepts-pos")
    const manifest = echoFromInputManifest()
    expect(validateWorkflowAcceptsInput(manifest, { value: "hello from input" }).ok).toBe(true)
    const result = await ecp.run(manifest, { input: { value: "hello from input" } })
    expect(result.run.status).toBe("completed")
    expect(result.output?.echo).toEqual({ echo: "hello from input" })
    await ecp.terminate()
  })

  it("seeds state so ref() reads accepted keys", async () => {
    const ecp = await initTestEcp("accepts-ref")
    const result = await ecp.run(echoFromInputManifest(), { input: { value: "wired" } })
    expect(result.state?.echo).toEqual({ echo: "wired" })
    expect(result.history).toBeDefined()
    await ecp.terminate()
  })

  it("dry-run with valid input completes without executing steps", async () => {
    const ecp = await initTestEcp("accepts-dry")
    const input = { value: "dry" }
    const result = await ecp.run(echoFromInputManifest(), { input, dryRun: true })
    expect(result.run.status).toBe("completed")
    expect(result.run.id).toBe("dry-run")
    expect(result.state).toEqual(input)
    expect(result.history).toBeUndefined()
    expect(result.output).toBeUndefined()
    await ecp.terminate()
  })

  it("allows optional-only accepts with empty input", () => {
    const manifest = workflow("Optional only")
      .accepts(z.object({ note: z.string().optional() }))
      .run([])
      .toManifest()
    expect(validateWorkflowAcceptsInput(manifest, {}).ok).toBe(true)
    expect(validateWorkflowAcceptsInput(manifest, undefined).ok).toBe(true)
  })

  it("allows extra unused keys on a valid object", () => {
    const manifest = echoFromInputManifest()
    expect(validateWorkflowAcceptsInput(manifest, { value: "ok", extra: true }).ok).toBe(true)
  })
})

describe("accepts gate (negative)", () => {
  it("rejects a missing required property", () => {
    const result = validateWorkflowAcceptsInput(echoFromInputManifest(), {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/Missing required property: value/)
    }
  })

  it("rejects the wrong type for a required string", () => {
    const result = validateWorkflowAcceptsInput(echoFromInputManifest(), { value: 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/expected type string/)
    }
  })

  it("rejects a non-object payload for an object accepts schema", () => {
    expect(validateAgainstJsonSchema(echoFromInputManifest().workflow.accepts, []).ok).toBe(false)
    expect(validateWorkflowAcceptsInput(echoFromInputManifest(), { value: [] }).ok).toBe(false)
  })

  it("throws on ecp.run before execute when required input is missing", async () => {
    const ecp = await initTestEcp("accepts-missing")
    const manifest = echoFromInputManifest()
    await expect(ecp.run(manifest)).rejects.toThrow(/Workflow accepts validation failed/)
    await expect(ecp.run(manifest, { input: { value: 1 } })).rejects.toThrow(
      /Workflow accepts validation failed/
    )
    await ecp.terminate()
  })

  it("throws on dry-run when input is invalid", async () => {
    const ecp = await initTestEcp("accepts-dry-bad")
    await expect(ecp.run(echoFromInputManifest(), { dryRun: true })).rejects.toThrow(
      /Workflow accepts validation failed/
    )
    await expect(
      ecp.run(echoFromInputManifest(), { input: { value: 1 }, dryRun: true })
    ).rejects.toThrow(/Workflow accepts validation failed/)
    await ecp.terminate()
  })
})

describe("accepts / returns gate (edge)", () => {
  it("runs with no input when accepts is omitted", async () => {
    const ecp = await initTestEcp("no-accepts")
    const manifest = workflow("No io")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "x" }).as("echo")])
      .toManifest()
    expect(validateWorkflowAcceptsInput(manifest, undefined).ok).toBe(true)
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("completed")
    expect(result.output).toBeUndefined()
    await ecp.terminate()
  })

  it("omits empty object accepts from the manifest", () => {
    const manifest = workflow("Empty")
      .accepts(z.object({}))
      .run([])
      .toManifest()
    expect(manifest.workflow.accepts).toBeUndefined()
    expect(validateWorkflowAcceptsInput(manifest, undefined).ok).toBe(true)
  })

  it("treats omitted optional properties as valid and wrong-typed optionals as invalid", () => {
    const manifest = workflow("Optional note")
      .accepts(z.object({ note: z.string().optional() }))
      .run([])
      .toManifest()
    expect(validateWorkflowAcceptsInput(manifest, {}).ok).toBe(true)
    expect(validateWorkflowAcceptsInput(manifest, { note: 1 }).ok).toBe(false)
  })

  it("treats an empty string as a valid string", () => {
    expect(validateWorkflowAcceptsInput(echoFromInputManifest(), { value: "" }).ok).toBe(true)
  })

  it("does not fail when an optional returns key is missing", async () => {
    const ecp = await initTestEcp("optional-returns")
    const manifest = workflow("Optional out")
      .returns(z.object({ extra: z.string().optional() }))
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "x" }).as("echo")])
      .toManifest()
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("completed")
    expect(result.output).toEqual({})
    await ecp.terminate()
  })

  it("fails the run when a required returns key is missing", async () => {
    const ecp = await initTestEcp("required-returns")
    const manifest = workflow("Missing out")
      .returns(z.object({ nope: z.string() }))
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hello" }).as("echo")])
      .toManifest()
    const failed = await ecp.run(manifest)
    expect(failed.run.status).toBe("failed")
    expect(failed.output).toEqual({})
    await ecp.terminate()
  })

  it("rejects test-session execute when accepts input is invalid", async () => {
    const ecp = await initTestEcp("test-session-accepts")
    const manifest = echoFromInputManifest()
    const session = await ecp.test(manifest).with({ input: {} }).start()
    const stepId = (manifest.steps[0] as { id: string }).id
    await expect(session.runTo(stepId)).rejects.toThrow(/Workflow accepts validation failed/)
    await ecp.terminate()
  })
})

describe("jsonSchema helper gaps", () => {
  it("treats empty string as type string and extra keys as allowed", () => {
    const schema = {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    }
    expect(validateAgainstJsonSchema(schema, { value: "" }).ok).toBe(true)
    expect(validateAgainstJsonSchema(schema, { value: "ok", extra: 1 }).ok).toBe(true)
  })

  it("rejects an optional property present with the wrong type", () => {
    const schema = jsonSchemaFromZod(z.object({ note: z.string().optional() }))
    expect(validateAgainstJsonSchema(schema, {}).ok).toBe(true)
    expect(validateAgainstJsonSchema(schema, { note: 1 }).ok).toBe(false)
  })
})
