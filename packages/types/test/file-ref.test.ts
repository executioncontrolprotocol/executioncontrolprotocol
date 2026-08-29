import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  FILE_REF_KINDS,
  fileRefSchema,
  fileRefSchemaOptions,
  fileRefValueSchemaHint,
  isFileRefSchema,
} from "../src/file-ref.js"

describe("fileRefSchema", () => {
  it("parses all four portable kinds", () => {
    const schema = fileRefSchema()
    expect(schema.parse({ kind: "file", path: "/a.png" })).toEqual({
      kind: "file",
      path: "/a.png",
    })
    expect(schema.parse({ kind: "artifact", uri: "ecp://x" })).toEqual({
      kind: "artifact",
      uri: "ecp://x",
    })
    expect(schema.parse({ kind: "url", url: "https://example.com/a.png" })).toEqual({
      kind: "url",
      url: "https://example.com/a.png",
    })
    expect(schema.parse({ kind: "buffer", data: "abc" })).toEqual({
      kind: "buffer",
      data: "abc",
    })
  })

  it("rejects invalid kind and missing required fields", () => {
    const schema = fileRefSchema()
    expect(() => schema.parse({ kind: "disk", path: "/a" })).toThrow()
    expect(() => schema.parse({ kind: "file" })).toThrow()
  })

  it("stores contentMediaType metadata on factory instances", () => {
    const schema = fileRefSchema({ contentMediaType: "image/*" })
    expect(fileRefSchemaOptions(schema)).toEqual({ contentMediaType: "image/*" })
    expect(fileRefValueSchemaHint({ contentMediaType: "image/*" })).toMatchObject({
      "x-ecp-file": true,
      contentMediaType: "image/*",
    })
  })

  it("supports array contentMediaType hints", () => {
    const types = ["image/png", "image/jpeg"]
    const schema = fileRefSchema({ contentMediaType: types })
    expect(fileRefSchemaOptions(schema)).toEqual({ contentMediaType: types })
    expect(fileRefValueSchemaHint({ contentMediaType: types }).contentMediaType).toEqual(types)
  })

  it("detects optional and nullable wrappers", () => {
    const schema = fileRefSchema({ contentMediaType: "image/*" }).optional().nullable()
    expect(isFileRefSchema(schema)).toBe(true)
    expect(fileRefSchemaOptions(schema)).toEqual({ contentMediaType: "image/*" })
  })

  it("returns false for non-file-ref Zod types", () => {
    expect(isFileRefSchema(z.string())).toBe(false)
    expect(
      isFileRefSchema(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("other"), path: z.string() }),
        ])
      )
    ).toBe(false)
  })
})

describe("fileRefValueSchemaHint", () => {
  it("includes x-ecp-file and kind enum without filter by default", () => {
    const hint = fileRefValueSchemaHint()
    expect(hint["x-ecp-file"]).toBe(true)
    expect(hint.contentMediaType).toBeUndefined()
    const kind = (hint.properties as Record<string, unknown>).kind as { enum: string[] }
    expect(kind.enum).toEqual(Object.values(FILE_REF_KINDS))
  })
})
