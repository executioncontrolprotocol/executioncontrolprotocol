import {
  FILE_ACCESS_PUBLISH_SUGGESTION,
  mediaTypeMatchesAllowList,
} from "@executioncontrolprotocol/protocol"
import type { CapabilityEntry, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { HostSchemaSet, validateExecution } from "../src/validate/validate.js"

const fullFileRefSchema = {
  oneOf: [
    {
      type: "object",
      properties: { kind: { const: "file" }, path: { type: "string" } },
      required: ["kind", "path"],
    },
    {
      type: "object",
      properties: { kind: { const: "url" }, url: { type: "string" } },
      required: ["kind", "url"],
    },
    {
      type: "object",
      properties: { kind: { const: "artifact" }, uri: { type: "string" } },
      required: ["kind", "uri"],
    },
  ],
}

const urlOnlyImage = {
  ...fullFileRefSchema,
  "x-ecp-file": { access: "url", mediaTypes: ["image/*"] },
}

const annotatedFileRef = {
  ...fullFileRefSchema,
  "x-ecp-file": {},
}

const adobeLike: CapabilityEntry = {
  id: "@vendor/plugin.image-step",
  plugin: "@vendor/plugin",
  package: "@vendor/plugin",
  pluginVersion: "1.0.0",
  summary: "s",
  description: "d",
  useCases: [],
  projections: [],
  accepts: {
    type: "object",
    properties: { image: urlOnlyImage },
    required: ["image"],
  },
  returns: { type: "object", properties: { ok: { type: "boolean" } } },
}

const fileProducer: CapabilityEntry = {
  ...adobeLike,
  id: "@vendor/plugin.file-out",
  accepts: { type: "object", properties: { path: { type: "string" } } },
  returns: {
    type: "object",
    properties: { file: annotatedFileRef },
  },
}

const urlProducer: CapabilityEntry = {
  ...adobeLike,
  id: "@vendor/plugin.url-out",
  accepts: { type: "object", properties: {} },
  returns: {
    type: "object",
    properties: {
      file: {
        type: "object",
        properties: { kind: { const: "url" }, url: { type: "string" } },
        required: ["kind", "url"],
      },
    },
  },
}

function execution(steps: ExecutionManifest["steps"]): ExecutionManifest {
  return {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps,
  }
}

describe("file access L3", () => {
  it("accepts a url literal for access url fields", async () => {
    const result = await validateExecution(
      execution([
        {
          id: "a",
          uses: adobeLike.id,
          input: { image: { kind: "url", url: "https://example.test/a.png", mediaType: "image/png" } },
        },
      ]),
      { capabilities: [adobeLike] },
    )
    expect(result.issues.some((issue) => issue.code === "ECP_TYPE_MISMATCH")).toBe(false)
  })

  it("rejects a file literal into access url with publish suggestion", async () => {
    const result = await validateExecution(
      execution([
        {
          id: "a",
          uses: adobeLike.id,
          input: { image: { kind: "file", path: "/tmp/x.png" } },
        },
      ]),
      { capabilities: [adobeLike] },
    )
    const mismatch = result.issues.find((issue) => issue.code === "ECP_TYPE_MISMATCH")
    expect(mismatch?.suggestions).toContain(FILE_ACCESS_PUBLISH_SUGGESTION)
  })

  it("rejects binding full FileRef union into access url", async () => {
    const result = await validateExecution(
      execution([
        { id: "make", uses: fileProducer.id, input: { path: "/x" }, as: "f" },
        { id: "use", uses: adobeLike.id, input: { image: { $ref: "state.f.file" } } },
      ]),
      { capabilities: [adobeLike, fileProducer] },
    )
    expect(result.issues.some((issue) => issue.code === "ECP_TYPE_MISMATCH")).toBe(true)
  })

  it("leaves a source with no kind information to the run-time check", async () => {
    const untyped: CapabilityEntry = {
      ...adobeLike,
      id: "@vendor/plugin.untyped-out",
      accepts: { type: "object", properties: {} },
      returns: { type: "object", properties: { file: { type: "object" } } },
    }
    const result = await validateExecution(
      execution([
        { id: "make", uses: untyped.id, input: {}, as: "u" },
        { id: "use", uses: adobeLike.id, input: { image: { $ref: "state.u.file" } } },
      ]),
      { capabilities: [adobeLike, untyped] },
    )
    expect(result.issues.some((issue) => issue.code === "ECP_TYPE_MISMATCH")).toBe(false)
  })

  it("names the kinds that make a binding unsafe", async () => {
    const result = await validateExecution(
      execution([
        { id: "make", uses: fileProducer.id, input: { path: "/x" }, as: "f" },
        { id: "use", uses: adobeLike.id, input: { image: { $ref: "state.f.file" } } },
      ]),
      { capabilities: [adobeLike, fileProducer] },
    )
    const issue = result.issues.find((entry) => entry.code === "ECP_TYPE_MISMATCH")
    expect(issue?.message).toContain("file, artifact")
    expect(issue?.suggestions).toContain(FILE_ACCESS_PUBLISH_SUGGESTION)
  })

  it("allows binding provably url output", async () => {
    const result = await validateExecution(
      execution([
        { id: "pub", uses: urlProducer.id, input: {}, as: "p" },
        { id: "use", uses: adobeLike.id, input: { image: { $ref: "state.p.file" } } },
      ]),
      { capabilities: [adobeLike, urlProducer] },
    )
    expect(result.issues.some((issue) => issue.code === "ECP_TYPE_MISMATCH")).toBe(false)
  })

  it("allows any FileRef kind when access is omitted", async () => {
    const open = {
      ...adobeLike,
      accepts: {
        type: "object",
        properties: { image: annotatedFileRef },
      },
    }
    const result = await validateExecution(
      execution([
        {
          id: "a",
          uses: open.id,
          input: { image: { kind: "file", path: "/tmp/x.png" } },
        },
      ]),
      { capabilities: [open] },
    )
    expect(result.issues.filter((issue) => issue.code === "ECP_TYPE_MISMATCH")).toHaveLength(0)
  })

  it("checks mediaTypes with wildcards at L3", async () => {
    const bad = await validateExecution(
      execution([
        {
          id: "a",
          uses: adobeLike.id,
          input: { image: { kind: "url", url: "https://example.test/d.pdf", mediaType: "application/pdf" } },
        },
      ]),
      { capabilities: [adobeLike] },
    )
    expect(bad.issues.some((issue) => issue.code === "ECP_TYPE_MISMATCH")).toBe(true)
    const ok = await validateExecution(
      execution([
        {
          id: "a",
          uses: adobeLike.id,
          input: { image: { kind: "url", url: "https://example.test/a.png" } },
        },
      ]),
      { capabilities: [adobeLike] },
    )
    expect(ok.issues.some((issue) => issue.code === "ECP_TYPE_MISMATCH")).toBe(false)
  })
})

describe("file access run time (Ajv keyword)", () => {
  it("fails validateInput when resolved ref is not url", async () => {
    const set = await HostSchemaSet.create([adobeLike])
    const errors = set.validateInput(adobeLike, {
      image: { kind: "file", path: "/tmp/x.png" },
    })
    expect(errors.length).toBeGreaterThan(0)
  })
})

describe("mediaTypeMatchesAllowList", () => {
  it("matches image/* patterns", () => {
    expect(mediaTypeMatchesAllowList("image/png", ["image/*"])).toBe(true)
    expect(mediaTypeMatchesAllowList("application/pdf", ["image/*"])).toBe(false)
  })
})