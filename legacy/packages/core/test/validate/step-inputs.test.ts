import { describe, expect, it } from "vitest"
import { z } from "zod"
import { defineExtension, capabilityFor, Registry } from "../../src/index.js"
import { ECP_INPUT_INVALID } from "../../src/types/index.js"
import { emptyValidationResult } from "../../src/validate/workflow-schema.js"
import {
  validateStepInputAgainstSchema,
  validateWorkflowStepInputs,
} from "../../src/validate/step-inputs.js"
import type { WorkflowManifest } from "../../src/types/index.js"

describe("validateStepInputAgainstSchema", () => {
  const schema = {
    type: "object",
    properties: {
      prompt: { type: "string" },
      numVariations: { type: "integer" },
    },
    required: ["prompt"],
  }

  it("accepts valid literal inputs", () => {
    expect(
      validateStepInputAgainstSchema(
        { prompt: "a cat", numVariations: 2 },
        schema,
        "gen"
      )
    ).toEqual([])
  })

  it("rejects unknown keys", () => {
    const issues = validateStepInputAgainstSchema(
      { prompt: "a cat", numVariation: 2 },
      schema,
      "gen"
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      code: ECP_INPUT_INVALID,
      path: "steps.gen.input.numVariation",
      message: 'Unknown input key "numVariation"',
    })
  })

  it("rejects missing required keys", () => {
    const issues = validateStepInputAgainstSchema({ numVariations: 1 }, schema, "gen")
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toBe("steps.gen.input.prompt")
  })

  it("rejects wrong literal types", () => {
    const issues = validateStepInputAgainstSchema(
      { prompt: 12 },
      schema,
      "gen"
    )
    expect(issues.some((i) => i.path === "steps.gen.input.prompt")).toBe(true)
  })

  it("skips $ref placeholders", () => {
    expect(
      validateStepInputAgainstSchema(
        { prompt: { $ref: "state.prompt" } },
        schema,
        "gen"
      )
    ).toEqual([])
  })

  it("rejects integers above maximum", () => {
    const ranged = {
      type: "object",
      properties: {
        numVariations: { type: "integer", minimum: 1, maximum: 4 },
      },
    }
    const issues = validateStepInputAgainstSchema({ numVariations: 9 }, ranged, "gen")
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      code: ECP_INPUT_INVALID,
      path: "steps.gen.input.numVariations",
    })
    expect(issues[0]?.message).toMatch(/<= 4/)
  })

  it("rejects values outside an enum", () => {
    const withEnum = {
      type: "object",
      properties: {
        "x-model-version": {
          type: "string",
          enum: ["image3", "image4"],
        },
      },
    }
    const issues = validateStepInputAgainstSchema(
      { "x-model-version": "image9" },
      withEnum,
      "gen"
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toBe("steps.gen.input.x-model-version")
  })

  it("validates nested literals while skipping nested refs", () => {
    const nested = {
      type: "object",
      properties: {
        image: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["url", "file"] },
            url: { type: "string" },
          },
          required: ["kind"],
        },
      },
    }
    expect(
      validateStepInputAgainstSchema(
        {
          image: {
            kind: "url",
            url: { $ref: "state.image.outputs.0.image.url" },
          },
        },
        nested,
        "crop"
      )
    ).toEqual([])
    const bad = validateStepInputAgainstSchema(
      { image: { kind: "blob", url: "https://example.com/a.png" } },
      nested,
      "crop"
    )
    expect(bad.some((i) => i.path === "steps.crop.input.image.kind")).toBe(true)
  })
})

describe("validateWorkflowStepInputs", () => {
  it("flags unknown keys via the capability Zod schema", async () => {
    const registry = new Registry()
    const ext = defineExtension("@executioncontrolprotocol", "test-inputs")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/test-inputs", "echo")
          .withInput(z.object({ value: z.string() }))
          .withOutput(z.object({}))
          .withHandler(async () => ({})),
      ])
      .build()
    await registry.registerExtension(ext)

    const workflow: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "t", label: "t" },
      steps: [
        {
          type: "step",
          id: "echo",
          uses: "@executioncontrolprotocol/test-inputs.echo",
          input: { valu: "x" },
        },
      ],
    }
    const result = emptyValidationResult(true)
    validateWorkflowStepInputs(workflow, registry, result)
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe(ECP_INPUT_INVALID)
    expect(result.errors[0]?.path).toBe("steps.echo.input.valu")
  })
})
