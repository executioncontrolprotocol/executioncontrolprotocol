import { describe, expect, it, beforeEach } from "vitest"
import { z } from "zod"
import {
  capabilityFor,
  extension,
  jsonSchemaFromZod,
  parseCapabilityMetadata,
  policy,
} from "../src/index.js"
import { registerStandardPolicies } from "@executioncontrolprotocol/policies"
import { createTestEnvironment } from "./helpers.js"
import { extractMentionedEntityIds } from "../src/harness/authoring/describe-for-prompt.js"

describe("environment.describe progressive disclosure", () => {
  beforeEach(async () => {
    await registerStandardPolicies()
  })

  it("bare describe is inventory only (summary, no metadata, no schemas)", async () => {
    const env = (await createTestEnvironment("d", "D")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])

    const ecp = await env.init()
    const desc = await ecp.describe()
    const echo = desc.capabilities.find((c) => c.id === "@executioncontrolprotocol/test.echo")
    expect(echo).toBeDefined()
    expect(echo?.summary).toMatch(/echo|return/i)
    expect(echo?.metadata).toBeUndefined()
    expect(echo?.inputSchema).toBeUndefined()
    expect(echo?.outputSchema).toBeUndefined()
  })

  it("exact capability id returns metadata and JSON Schema I/O", async () => {
    const env = (await createTestEnvironment("d")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])

    const ecp = await env.init()
    const desc = await ecp.describe({
      capabilities: {
        match: "@executioncontrolprotocol/test.echo",
        mode: "exact",
      },
    })
    expect(desc.capabilities).toHaveLength(1)
    const echo = desc.capabilities[0]
    expect(echo?.metadata?.description).toBeTruthy()
    expect(echo?.metadata?.useCases?.length).toBeGreaterThan(0)
    expect(echo?.metadata?.samplePrompts?.length).toBeGreaterThan(0)
    expect(echo?.inputSchema).toMatchObject({ type: "object" })
    expect(echo?.outputSchema).toMatchObject({ type: "object" })
    expect(JSON.parse(JSON.stringify(echo?.inputSchema))).toEqual(echo?.inputSchema)
  })

  it("DescribeSelection.id aliases exact match", async () => {
    const env = (await createTestEnvironment("d")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])

    const ecp = await env.init()
    const desc = await ecp.describe({
      capabilities: { id: "@executioncontrolprotocol/test.echo" },
    })
    expect(desc.capabilities).toHaveLength(1)
    expect(desc.capabilities[0]?.metadata).toBeDefined()
  })

  it("authoring include adds schemas without nested metadata", async () => {
    const env = (await createTestEnvironment("d")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])

    const ecp = await env.init()
    const desc = await ecp.describe({
      capabilities: { include: ["inputSchema", "outputSchema"] },
    })
    const echo = desc.capabilities.find((c) => c.id === "@executioncontrolprotocol/test.echo")
    expect(echo?.id).toBe("@executioncontrolprotocol/test.echo")
    expect(echo?.summary).toBeTruthy()
    expect(echo?.inputSchema).toBeDefined()
    expect(echo?.metadata).toBeUndefined()
  })

  it("exact extension id returns extension metadata", async () => {
    const env = (await createTestEnvironment("d")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])

    const ecp = await env.init()
    const desc = await ecp.describe({
      extensions: {
        match: "@executioncontrolprotocol/test",
        mode: "exact",
      },
    })
    expect(desc.extensions).toHaveLength(1)
    expect(desc.extensions[0]?.metadata?.summary).toBeTruthy()
    expect(desc.extensions[0]?.metadata?.description).toBeTruthy()
  })

  it("filters capabilities by fuzzy match and projects include fields", async () => {
    const env = (await createTestEnvironment("d", "D")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])
      .withPolicies([policy("@executioncontrolprotocol/budget", "B").with({})])

    const ecp = await env.init()
    const desc = await ecp.describe({
      capabilities: {
        match: "echo",
        include: ["id", "label"],
        limit: 1,
      },
    })
    expect(desc.capabilities).toHaveLength(1)
    expect(desc.capabilities[0]?.id).toBe("@executioncontrolprotocol/test.echo")
    expect(desc.capabilities[0]).not.toHaveProperty("inputSchema")
  })
})

describe("capability metadata validation", () => {
  it("rejects missing required fields", () => {
    expect(() =>
      parseCapabilityMetadata({
        summary: "x",
        description: "y",
        useCases: [],
        samplePrompts: ["hi"],
      })
    ).toThrow()
  })

  it("rejects schema how-to phrases in prose", () => {
    expect(() =>
      parseCapabilityMetadata({
        summary: "Read the inputSchema carefully",
        description: "Uses the capability",
        useCases: ["A"],
        samplePrompts: ["B"],
      })
    ).toThrow(/inputschema/i)
  })

  it("withMetadata rejects banned phrases at build time", () => {
    expect(() =>
      capabilityFor("@executioncontrolprotocol/meta-test", "cap")
        .withMetadata({
          summary: "ok",
          description: "Call withInput first",
          useCases: ["A"],
          samplePrompts: ["B"],
        })
        .withHandler(async () => ({}))
    ).toThrow(/withinput/i)
  })
})

describe("jsonSchemaFromZod constraints", () => {
  it("projects min/max length, number bounds, int, and field descriptions", () => {
    const schema = z.object({
      name: z.string().min(2).max(10).describe("Display name"),
      count: z.number().int().min(1).max(5),
    })
    const json = jsonSchemaFromZod(schema)
    expect(json).toMatchObject({
      type: "object",
      required: ["name", "count"],
      properties: {
        name: { type: "string", minLength: 2, maxLength: 10, description: "Display name" },
        count: { type: "integer", minimum: 1, maximum: 5 },
      },
    })
  })
})

describe("environment.search metadata haystack", () => {
  it("ranks hits from samplePrompts and useCases", async () => {
    const env = (await createTestEnvironment("s")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])

    const ecp = await env.init()
    const result = await ecp.search("greeting")
    expect(result.results.some((r) => r.id === "@executioncontrolprotocol/test.echo")).toBe(true)
  })

  it("keeps search results light (no schemas by default)", async () => {
    const env = (await createTestEnvironment("s")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])

    const ecp = await env.init()
    const result = await ecp.search("echo")
    expect(result.results[0]?.id).toBe("@executioncontrolprotocol/test.echo")
    expect(result.results[0]?.inputSchema).toBeUndefined()
  })

  it("ranks multi-token queries", async () => {
    const env = (await createTestEnvironment("s")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])

    const ecp = await env.init()
    const result = await ecp.search("test echo")
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0]?.id).toBe("@executioncontrolprotocol/test.echo")
    expect(result.results[0]?.score).toBeGreaterThan(0)
  })
})

describe("extractMentionedEntityIds", () => {
  it("extracts known capability ids from a message", () => {
    const ids = extractMentionedEntityIds(
      "Tell me about @executioncontrolprotocol/test.echo please",
      ["@executioncontrolprotocol/test", "@executioncontrolprotocol/test.echo"],
      3
    )
    expect(ids).toEqual(["@executioncontrolprotocol/test.echo"])
  })

  it("ignores unknown ids", () => {
    const ids = extractMentionedEntityIds("Use @other/pkg.cap", [
      "@executioncontrolprotocol/test.echo",
    ])
    expect(ids).toEqual([])
  })
})

describe("fluent catalog lines include summary", () => {
  it("formatEnvironmentSummaryLines includes capability summary", async () => {
    const { formatEnvironmentSummaryLines, summarizeEnvironmentDescriptor } = await import(
      "../src/harness/authoring/summarize-environment.js"
    )
    const env = (await createTestEnvironment("f")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])
    const ecp = await env.init()
    const desc = await ecp.describe({
      capabilities: { include: ["inputSchema", "outputSchema"] },
    })
    const summary = summarizeEnvironmentDescriptor(desc)
    const lines = formatEnvironmentSummaryLines(summary, { format: "fluent" }).join("\n")
    expect(lines).toContain("@executioncontrolprotocol/test.echo")
    expect(lines).toMatch(/—/)
  })
})
