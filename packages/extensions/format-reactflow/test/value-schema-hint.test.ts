import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  portsForStep,
  valueSchemaFromEqlLabel,
  valueSchemaFromZod,
  valueSchemasFromCapabilitySchema,
} from "../src/index.js"
import type { StepNode } from "@executioncontrolprotocol/types"
import type { Registry } from "@executioncontrolprotocol/core"

describe("valueSchemaFromZod", () => {
  it("projects string / number / boolean primitives", () => {
    expect(valueSchemaFromZod(z.string())).toEqual({ type: "string" })
    expect(valueSchemaFromZod(z.number())).toEqual({ type: "number" })
    expect(valueSchemaFromZod(z.boolean())).toEqual({ type: "boolean" })
  })

  it("keeps enums as string primitive with enum constraint", () => {
    expect(valueSchemaFromZod(z.enum(["a", "b", "c"]))).toEqual({
      type: "string",
      enum: ["a", "b", "c"],
    })
  })

  it("unwraps optional and nullable without changing the hint", () => {
    expect(valueSchemaFromZod(z.enum(["x", "y"]).optional())).toEqual({
      type: "string",
      enum: ["x", "y"],
    })
    expect(valueSchemaFromZod(z.string().nullable())).toEqual({ type: "string" })
  })

  it("projects light object and array shapes", () => {
    expect(
      valueSchemaFromZod(
        z.object({
          name: z.string(),
          count: z.number(),
        })
      )
    ).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "number" },
      },
    })
    expect(valueSchemaFromZod(z.array(z.string()))).toEqual({
      type: "array",
      items: { type: "string" },
    })
  })
})

describe("valueSchemaFromEqlLabel", () => {
  it("synthesizes primitives from EQL labels", () => {
    expect(valueSchemaFromEqlLabel("string!")).toEqual({ type: "string" })
    expect(valueSchemaFromEqlLabel("integer")).toEqual({ type: "integer" })
    expect(valueSchemaFromEqlLabel("unknown")).toBeUndefined()
  })
})

describe("portsForStep valueSchema", () => {
  it("attaches enum valueSchema from capability Zod input", () => {
    const inputSchema = z.object({
      mode: z.enum(["fast", "slow"]),
      prompt: z.string(),
    })
    const registry = {
      getCapability: () => ({
        inputSchema,
        outputSchema: z.object({ text: z.string() }),
      }),
    } as unknown as Registry

    const step: StepNode = {
      id: "s1",
      uses: "@vendor/demo.run",
      input: { mode: "fast", prompt: "hi" },
    }

    const { inputs } = portsForStep(step, registry)
    const mode = inputs.find((p) => p.name === "mode")
    const prompt = inputs.find((p) => p.name === "prompt")

    expect(mode?.valueSchema).toEqual({ type: "string", enum: ["fast", "slow"] })
    expect(prompt?.valueSchema).toEqual({ type: "string" })
    expect(prompt?.valueSchema).not.toHaveProperty("enum")
    expect(mode?.required).toBe(true)
  })

  it("passes through JSON Schema property nodes", () => {
    const schemas = valueSchemasFromCapabilitySchema({
      type: "object",
      properties: {
        role: { type: "string", enum: ["user", "assistant"] },
        n: { type: "integer" },
      },
      required: ["role"],
    })
    expect(schemas.get("role")).toEqual({ type: "string", enum: ["user", "assistant"] })
    expect(schemas.get("n")).toEqual({ type: "integer" })
  })
})
