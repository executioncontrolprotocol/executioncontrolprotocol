import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  buildInput,
  capabilityName,
  deriveMetadata,
  deriveProjections,
  GENERATED_FAMILIES,
  generateAll,
  generateFamily,
  loadFamilySpecs,
} from "../scripts/lib/generate.mjs"
import { assertAgentMetadata } from "../scripts/lib/metadata-prose.mjs"
import { applyProductShape, classifyProductShape } from "../scripts/lib/product-shape.mjs"
import { cleanDescription, resolveRefs, ZodEmitter } from "../scripts/lib/zod-emitter.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const openapiDir = join(root, "openapi")
const generatedDir = join(root, "src", "generated")

function committed(rel: string): string {
  return readFileSync(join(generatedDir, rel), "utf8").replace(/\r\n/g, "\n")
}

interface Op {
  operationId?: string
  parameters?: unknown[]
  requestBody?: unknown
  responses?: Record<string, unknown>
}

function docWith(op: Op, components: Record<string, unknown> = {}) {
  return {
    openapi: "3.0.0",
    servers: [{ url: "https://api.example.test/" }],
    paths: { "/v1/things/{thingId}": { post: { responses: { "200": {} }, ...op } } },
    components: { schemas: components },
  }
}

function inputFor(op: Op, components: Record<string, unknown> = {}) {
  const doc = docWith(op, components)
  const emitter = new ZodEmitter(new Map(Object.entries(components)), { mode: "input" })
  const built = buildInput(doc.paths["/v1/things/{thingId}"].post, doc, emitter, "test")
  return { built, emitter, fields: built.fields.map((f: string) => resolveRefs(f, "")).join("\n") }
}

describe.each(GENERATED_FAMILIES)("generated output snapshot: %s", (family) => {
  const specs = loadFamilySpecs(openapiDir, { families: [family] }).get(family)!
  const result = generateFamily(family, specs)

  it("generates without schema errors or skipped capabilities needed by the dogfood", () => {
    expect(result.errors).toEqual([])
    if (family === "photoshop") expect(result.operations.map((o: { name: string }) => o.name)).toContain("photoshop-actions")
  })

  it.each(["schemas.ts", "capabilities.ts", "operations.ts"])("matches the committed src/generated/%s", (file) => {
    expect(result.files[file]).toBe(committed(`${family}/${file}`))
  })

  it("keeps the operation table stable", () => {
    expect(result.operations).toMatchSnapshot()
  })
})

describe("full generation", () => {
  const all = generateAll(loadFamilySpecs(openapiDir, { families: GENERATED_FAMILIES }))

  it("keeps unique verb-led summaries and goal-oriented use cases", () => {
    const metas: { name: string; summary: string; useCases: string[] }[] = []
    for (const family of GENERATED_FAMILIES) {
      const specs = loadFamilySpecs(openapiDir, { families: [family] }).get(family)!
      metas.push(...generateFamily(family, specs).agentMetadata)
    }
    expect(() => assertAgentMetadata(metas)).not.toThrow()
  })

  it("has no schema errors and matches the committed index and meta.json", () => {
    expect(all.errors).toEqual([])
    expect(all.files["index.ts"]).toBe(committed("index.ts"))
    expect(all.files["meta.json"]).toBe(committed("meta.json"))
    expect(Object.keys(all.files).every((rel) => all.files[rel] === committed(rel))).toBe(true)
    expect(all.meta.families).toEqual(GENERATED_FAMILIES)
    expect(all.meta.pendingFamilies).toEqual([])
    expect(all.meta.capabilityCount).toBe(63)
  })

  it("gives every capability summary, description, useCases and projections", () => {
    for (const [family, specs] of loadFamilySpecs(openapiDir)) {
      const source = generateFamily(family, specs).files["capabilities.ts"] as string
      const blocks = source.split(/\n {2}"[a-z0-9-]+": capability/).slice(1)
      expect(blocks.length).toBeGreaterThan(0)
      for (const block of blocks) {
        expect(block).toMatch(/summary: ".+",/)
        expect(block).toMatch(/description: ".+",/)
        expect(block).toMatch(/useCases: \["[^"]+/)
        expect(block).toMatch(/projections: \["[^"]+/)
        expect(block).toMatch(/handler: \(\) => import\("\.\/operations\.js"\)/)
      }
    }
  })

  it("records skipped operations with a reason and generates unique keys within 64 characters", () => {
    for (const entry of all.meta.skipped) expect(entry.reason).toMatch(/non-JSON|longer than/)
    const names = all.meta.capabilities.map((c: { name: string }) => c.name)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9-]{0,63}$/)
  })
})

describe("buildInput hoisting", () => {
  it("hoists path, query and header parameters, keeping API requiredness", () => {
    const { built, fields } = inputFor({
      parameters: [
        { name: "thingId", in: "path", schema: { type: "string" } },
        { name: "limit", in: "query", required: true, schema: { type: "integer" } },
        { name: "cursor", in: "query", schema: { type: "string" } },
        { name: "x-model-version", in: "header", schema: { type: "string" }, description: "Model." },
        { name: "Authorization", in: "header", required: true, schema: { type: "string" } },
        { name: "x-api-key", in: "header", required: true, schema: { type: "string" } },
        { name: "Content-Type", in: "header", schema: { type: "string", enum: ["application/json"] } },
        { name: "session", in: "cookie", schema: { type: "string" } },
      ],
    })
    expect(built.parameters).toEqual({ path: ["thingId"], query: ["limit", "cursor"], headers: ["x-model-version"], body: [] })
    expect(fields).toContain("thingId: z.string()")
    expect(fields).toContain("limit: z.number().int()")
    expect(fields).toContain("cursor: z.string().optional()")
    expect(fields).toContain('"x-model-version": z.string().optional().describe("Model.")')
    expect(fields).not.toMatch(/Authorization|x-api-key|Content-Type|session/)
  })

  it("hoists JSON body fields as optional parameters and adds an open optional body", () => {
    const { built, fields } = inputFor(
      { requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Req" } } } } },
      { Req: { type: "object", required: ["prompt"], properties: { prompt: { type: "string" }, n: { type: "integer" } } } },
    )
    expect(built.parameters.body).toEqual(["prompt", "n"])
    expect(built.keys).toEqual(["prompt", "n", "body"])
    expect(fields).toContain("prompt: z.string().optional()")
    expect(fields).toContain("body: z.looseObject({}).optional()")
    expect(resolveRefs(built.bodySchema, "")).toBe("In_Req")
    expect(built.bodyRequired).toBe(true)
    expect(built.defaultCaiClaimVersion).toBe(false)
  })

  it("hoists the union of fields from a oneOf body and flags caiClaimVersion", () => {
    const { built } = inputFor({
      requestBody: {
        content: {
          "application/json": {
            schema: {
              oneOf: [
                { type: "object", properties: { prompt: { type: "string" }, caiClaimVersion: { type: "integer" } } },
                { type: "object", properties: { image: { type: "object", properties: { url: { type: "string" } } } } },
              ],
            },
          },
        },
      },
    })
    expect(built.parameters.body).toEqual(["prompt", "caiClaimVersion", "image"])
    expect(built.defaultCaiClaimVersion).toBe(true)
  })

  it("keeps a non-object JSON body as the body parameter only", () => {
    const { built, fields } = inputFor({
      requestBody: { required: true, content: { "application/json": { schema: { type: "array", items: { type: "string" } } } } },
    })
    expect(built.parameters.body).toEqual([])
    expect(fields).toBe("  body: z.array(z.string())")
  })

  it("makes a non-object body optional when the API does not require it", () => {
    const { fields } = inputFor({
      requestBody: { required: false, content: { "application/json": { schema: { type: "string" } } } },
    })
    expect(fields).toBe("  body: z.string().optional()")
  })

  it("skips operations whose body is not JSON", () => {
    const { built } = inputFor({ requestBody: { content: { "multipart/form-data": { schema: { type: "object" } } } } })
    expect(built.skip).toMatch(/non-JSON request body \(multipart\/form-data\)/)
  })

  it("throws on a field name collision between a parameter and a body field", () => {
    expect(() =>
      inputFor({
        parameters: [{ name: "prompt", in: "query", schema: { type: "string" } }],
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { prompt: { type: "string" } } } } } },
      }),
    ).toThrow(/collision: "prompt"/)
    expect(() => inputFor({ parameters: [{ name: "body", in: "query", schema: { type: "string" } }] })).toThrow(/collision: "body"/)
  })
})

describe("ZodEmitter", () => {
  const components = new Map<string, unknown>(
    Object.entries({
      Base: { type: "object", description: "Base." },
      Url: { type: "object", required: ["url"], allOf: [{ $ref: "#/components/schemas/Base" }, { type: "object", properties: { url: { type: "string" } } }] },
      Inline: {
        type: "object",
        required: ["content"],
        allOf: [{ $ref: "#/components/schemas/Base" }, { properties: { content: { type: "string", maxLength: 10 } } }],
      },
      Node: {
        type: "object",
        properties: { name: { type: "string" }, children: { type: "array", items: { oneOf: [{ $ref: "#/components/schemas/Node" }, { $ref: "#/components/schemas/Leaf" }] } } },
      },
      Leaf: { type: "object", required: ["name"], properties: { name: { type: "string" }, value: { type: "number", nullable: true } } },
      Free: { type: "object", additionalProperties: true, properties: { a: { type: "string" } } },
      Map: { type: "object", additionalProperties: { type: "string" } },
    }),
  )

  it("flattens allOf and object-only oneOf so every field sits under properties", () => {
    const emitter = new ZodEmitter(components, { mode: "input" })
    const expr = resolveRefs(emitter.schemaToZod({ oneOf: [{ $ref: "#/components/schemas/Url" }, { $ref: "#/components/schemas/Inline" }] }, "t"), "")
    expect(expr).toBe("In_OneOf_Inline_or_Url")
    const [, , source] = emitter.components().find(([ident]: [string]) => ident === "In_OneOf_Inline_or_Url")!
    expect(source).toContain("content: z.string().max(10).optional()")
    expect(source).toContain("url: z.string().optional()")
    expect(source).toContain("z.strictObject(")
  })

  it("keeps a field required only when every variant requires it", () => {
    const emitter = new ZodEmitter(components, { mode: "input" })
    const flat = emitter.flattenObject({ oneOf: [{ $ref: "#/components/schemas/Leaf" }, { $ref: "#/components/schemas/Url" }] })
    expect([...flat.required]).toEqual([])
    const both = emitter.flattenObject({ allOf: [{ $ref: "#/components/schemas/Leaf" }, { $ref: "#/components/schemas/Url" }] })
    expect([...both.required].sort()).toEqual(["name", "url"])
  })

  it("emits open objects for responses and closed objects for requests", () => {
    const input = new ZodEmitter(components, { mode: "input" })
    const output = new ZodEmitter(components, { mode: "output" })
    expect(input.schemaToZod({ type: "object", properties: { a: { type: "string" } } }, "t")).toContain("z.strictObject(")
    expect(output.schemaToZod({ type: "object", properties: { a: { type: "string" } } }, "t")).toContain("z.looseObject(")
    expect(input.schemaToZod({ type: "object" }, "t")).toBe("z.looseObject({})")
    expect(input.schemaToZod({ $ref: "#/components/schemas/Map" }, "t")).toContain("In_Map")
    expect(input.components().find(([i]: [string]) => i === "In_Map")[2]).toContain("z.record(z.string(), z.string())")
  })

  it("shares one component for a recursive union and stops recursion after one typed level", () => {
    const emitter = new ZodEmitter(components, { mode: "output" })
    emitter.schemaToZod({ $ref: "#/components/schemas/Node" }, "t")
    const emitted = emitter.components()
    expect(emitted.map(([ident]: [string]) => ident)).toEqual(["Out_Node", "Out_OneOf_Leaf_or_Node"])
    const union = emitted.find(([ident]: [string]) => ident === "Out_OneOf_Leaf_or_Node")[2] as string
    expect(union).toContain("value: z.number().nullable().optional()")
    expect(union).toContain('z.looseObject({}).describe("Nested Leaf, Node (recursive; checked by the API, not here).")')
    expect(union).not.toMatch(/\u0001Out_OneOf/)
    expect(emitter.errors).toEqual([])
  })

  it("stubs a direct self-reference instead of emitting a cycle", () => {
    const emitter = new ZodEmitter(
      new Map([["Self", { type: "object", properties: { next: { $ref: "#/components/schemas/Self" } } }]]),
      { mode: "input" },
    )
    emitter.schemaToZod({ $ref: "#/components/schemas/Self" }, "t")
    expect(emitter.components()[0][2]).toContain('next: z.looseObject({}).describe("Nested Self (recursive; checked by the API, not here).").optional()')
  })

  it("reports free-form request objects that declare fields, and untyped schemas", () => {
    const emitter = new ZodEmitter(components, { mode: "input" })
    emitter.schemaToZod({ $ref: "#/components/schemas/Free" }, "t")
    emitter.schemaToZod({ description: "nothing" }, "u")
    emitter.schemaToZod({ $ref: "#/components/schemas/Missing" }, "v")
    expect(emitter.errors).toEqual([
      expect.stringContaining("Free-form object"),
      expect.stringContaining("Untyped schema at u"),
      "Missing component schema: Missing",
    ])
  })

  it("maps scalars, enums, nullables and type arrays", () => {
    const emitter = new ZodEmitter(new Map(), { mode: "input" })
    expect(emitter.schemaToZod({ type: "string", minLength: 1, maxLength: 5 }, "t")).toBe("z.string().min(1).max(5)")
    expect(emitter.schemaToZod({ type: "integer", minimum: 0, maximum: 9 }, "t")).toBe("z.number().int().min(0).max(9)")
    expect(emitter.schemaToZod({ type: "array", items: { type: "boolean" }, minItems: 1 }, "t")).toBe("z.array(z.boolean()).min(1)")
    expect(emitter.schemaToZod({ enum: ["a", "b"], nullable: true }, "t")).toBe('z.enum(["a", "b"]).nullable()')
    expect(emitter.schemaToZod({ enum: [1, 2] }, "t")).toBe("z.union([z.literal(1), z.literal(2)])")
    expect(emitter.schemaToZod({ type: ["string", "null"] }, "t")).toBe("z.string().nullable()")
    expect(emitter.schemaToZod({ oneOf: [{ type: "string" }, { type: "integer" }] }, "t")).toBe("z.union([z.string(), z.number().int()])")
  })
})

describe("naming and metadata", () => {
  it("prefixes the family, applies remaps and derives names from paths", () => {
    expect(capabilityName("photoshop", "executeActions", "post", "/v2/execute-actions")).toBe("photoshop-actions")
    expect(capabilityName("firefly", "firefly_image_v5_generate_async_v4", "post", "/v4/x")).toBe("firefly-generate-images-v5-async")
    expect(capabilityName("express", "", "get", "/v1/documents/{docId}/tags")).toBe("express-get-v1-documents-by-doc-id-tags")
  })

  it("derives prose metadata with at least one use case and projection", () => {
    const meta = deriveMetadata({ summary: "Generate images." }, "firefly", "firefly-generate-images-v3-async", "async-submit")
    expect(meta.summary).toBe("Generate images (Adobe Firefly).")
    expect(meta.description).toContain("waits for it to finish")
    expect(meta.useCases[0]).toContain("prompt")
    expect(meta.projections.length).toBeGreaterThan(0)

    const bare = deriveMetadata({}, "indesign", "indesign-list-app-versions", "sync")
    expect(bare.summary).toBe("List supported InDesign app versions for custom scripts (Adobe InDesign).")
    expect(bare.useCases[0]).toContain("InDesign versions")
  })

  it("uses the hand-written photoshop-actions prose", () => {
    const meta = deriveMetadata({ summary: "Execute actions" }, "photoshop", "photoshop-actions", "async-submit")
    expect(meta.description).toContain("options.uxp.source.content")
  })

  it("picks projections by operation kind", () => {
    expect(deriveProjections("x-list-voices", "sync")[0]).toContain("listed item")
    expect(deriveProjections("x-get-document-info", "async-submit")[0]).toContain("document facts")
    expect(deriveProjections("x-generate", "async-submit")[0]).toContain("asset URLs")
    expect(deriveProjections("x-ping", "sync")[0]).toContain("ids or asset URLs")
  })

  it("cleans and caps descriptions", () => {
    expect(cleanDescription("<p>Hello\n  world</p>")).toBe("Hello world")
    expect(cleanDescription(42)).toBe("")
    const long = cleanDescription(`${"Sentence one is here. ".repeat(30)}`, 100)
    expect(long.length).toBeLessThanOrEqual(100)
    expect(long.endsWith(".")).toBe(true)
    expect(cleanDescription("x".repeat(50), 20)).toBe(`${"x".repeat(17)}...`)
  })
})

describe("product-shape codegen", () => {
  it("classifies image jobs, manifest, and photoshop multi-output", () => {
    expect(classifyProductShape("firefly-generate-images-v3-async", { schema: { $ref: "#/components/schemas/JobResult" } })).toBe(
      "image-job",
    )
    expect(classifyProductShape("photoshop-generate-manifest", { defaultManifestOutputs: true })).toBe("manifest")
    expect(classifyProductShape("photoshop-create-composite", { schema: { $ref: "#/components/schemas/Result" } })).toBe(
      "photoshop-multi",
    )
  })

  it("emits FileRef returns for JobResult async capabilities", () => {
    const emitter = new ZodEmitter(new Map(), { mode: "output" })
    const resolved = { schema: { $ref: "#/components/schemas/JobResult" } }
    const shaped = applyProductShape("firefly-generate-images-v3-async", "async-submit", {}, {}, resolved, emitter, "t")
    expect(shaped.returnsZod).toContain("images: z.array")
    expect(shaped.productShape).toEqual({ kind: "image-job", mediaArray: "images" })
  })
})
