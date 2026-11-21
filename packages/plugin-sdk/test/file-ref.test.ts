import { describe, expect, it } from "vitest"
import { fileRefSchema, zodToJsonSchema } from "../src/index.js"

describe("fileRefSchema", () => {
  it("stamps x-ecp-file into JSON Schema", () => {
    const schema = zodToJsonSchema(fileRefSchema({ access: "url", mediaTypes: ["image/png"] }), "input")
    expect(schema["x-ecp-file"]).toEqual({ access: "url", mediaTypes: ["image/png"] })
    expect(schema.jsonSchema).toBeUndefined()
  })

  it("omits access when not set", () => {
    const schema = zodToJsonSchema(fileRefSchema(), "output")
    expect(schema["x-ecp-file"]).toEqual({})
  })

  it("parses optional archive on url refs", () => {
    const schema = fileRefSchema()
    const parsed = schema.parse({
      kind: "url",
      url: "https://example.test/a.png",
      archive: { kind: "artifact", uri: "ecp://runs/r/artifacts/a.png", name: "a.png" },
    })
    expect(parsed.archive?.name).toBe("a.png")
  })
})