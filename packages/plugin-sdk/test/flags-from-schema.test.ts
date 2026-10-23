import { describe, expect, it } from "vitest"
import { z } from "zod"
import { flagProvided, flagsFromSchema } from "../src/flags-from-schema.js"

describe("flagsFromSchema", () => {
  it("maps string, number, boolean, enum and string arrays", () => {
    const schema = z.object({
      expression: z.string(),
      count: z.number(),
      verbose: z.boolean(),
      mode: z.enum(["fast", "slow"]),
      tags: z.array(z.string()),
    })
    const flags = flagsFromSchema(schema)
    expect(Object.keys(flags).sort()).toEqual(["count", "expression", "mode", "tags", "verbose"])
    expect(flags.mode).toBeDefined()
    expect(flags.tags).toBeDefined()
  })

  it("kebab-cases camelCase fields", () => {
    const flags = flagsFromSchema(z.object({ maxCostUsd: z.number() }))
    expect(Object.keys(flags)).toEqual(["max-cost-usd"])
  })

  it("skips reserved flag names so they stay input-only", () => {
    const flags = flagsFromSchema(
      z.object({
        json: z.boolean(),
        input: z.string(),
        help: z.string(),
        yes: z.boolean(),
        value: z.string(),
      })
    )
    expect(Object.keys(flags)).toEqual(["value"])
  })

  it("skips nested objects, unions and unknowns", () => {
    const flags = flagsFromSchema(
      z.object({
        payload: z.unknown(),
        nested: z.object({ a: z.string() }),
        either: z.union([z.string(), z.number()]),
        expression: z.string(),
      })
    )
    expect(Object.keys(flags)).toEqual(["expression"])
  })

  it("treats optional fields as non-required flags", () => {
    const flags = flagsFromSchema(z.object({ name: z.string().optional() }))
    expect(flags.name).toBeDefined()
  })

  it("gives --output the short flag -o", () => {
    const flags = flagsFromSchema(z.object({ output: z.string().optional() }))
    expect(flags.output).toBeDefined()
    expect((flags.output as { char?: string }).char).toBe("o")
  })

  it("returns no flags for a non-object schema", () => {
    expect(flagsFromSchema(undefined)).toEqual({})
    expect(flagsFromSchema(z.string())).toEqual({})
  })

  it("adds allowNo for defaulted booleans", () => {
    const flags = flagsFromSchema(z.object({ verbose: z.boolean().default(true) }))
    expect(flags.verbose).toBeDefined()
    expect((flags.verbose as { allowNo?: boolean }).allowNo).toBe(true)
  })

  it("skips boolean arrays", () => {
    const flags = flagsFromSchema(z.object({ flags: z.array(z.boolean()), tags: z.array(z.string()) }))
    expect(Object.keys(flags)).toEqual(["tags"])
  })

  it("flagProvided sees long flags, equals form, and -o", () => {
    expect(flagProvided(["--expression", "x"], "expression")).toBe(true)
    expect(flagProvided(["--expression=x"], "expression")).toBe(true)
    expect(flagProvided(["--other"], "expression")).toBe(false)
    expect(flagProvided(["-o", "out.json"], "output")).toBe(true)
    expect(flagProvided(["-o=out.json"], "output")).toBe(true)
    expect(flagProvided(["--expression"], "output")).toBe(false)
  })
})
