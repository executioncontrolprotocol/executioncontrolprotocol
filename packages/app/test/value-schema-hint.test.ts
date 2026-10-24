import { describe, expect, it } from "vitest"
import { z } from "zod"
import { fileRefSchema } from "@executioncontrolprotocol/core/types"
import type { Registry } from "@executioncontrolprotocol/core"
import type { StepNode } from "@executioncontrolprotocol/core/types"
import {
  portsForStep,
  valueSchemaFromEqlLabel,
  valueSchemaFromZod,
  valueSchemasFromCapabilitySchema,
} from "../src/graph/index.js"

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

  it("projects fileRefSchema with contentMediaType", () => {
    expect(valueSchemaFromZod(fileRefSchema({ contentMediaType: "image/*" }))).toMatchObject({
      "x-ecp-file": true,
      contentMediaType: "image/*",
    })
  })
})

describe("valueSchemaFromEqlLabel", () => {
  it("synthesizes primitives from type labels", () => {
    expect(valueSchemaFromEqlLabel("string!")).toEqual({ type: "string" })
    expect(valueSchemaFromEqlLabel("integer")).toEqual({ type: "integer" })
    expect(valueSchemaFromEqlLabel("file!")).toMatchObject({ "x-ecp-file": true })
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
    expect(mode?.required).toBe(true)
  })

  it("attaches file valueSchema from fileRefSchema input", () => {
    const inputSchema = z.object({
      image: fileRefSchema({ contentMediaType: "image/*" }),
    })
    const registry = {
      getCapability: () => ({
        inputSchema,
        outputSchema: z.object({ ok: z.boolean() }),
      }),
    } as unknown as Registry
    const step: StepNode = {
      id: "s1",
      uses: "@vendor/sharp.transform",
      input: {},
    }
    const { inputs } = portsForStep(step, registry)
    const image = inputs.find((p) => p.name === "image")
    expect(image?.typeLabel).toBe("file!")
    expect(image?.valueSchema).toMatchObject({
      "x-ecp-file": true,
      contentMediaType: "image/*",
    })
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
