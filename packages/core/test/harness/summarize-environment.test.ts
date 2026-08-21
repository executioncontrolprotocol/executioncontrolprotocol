import { describe, expect, it } from "vitest"
import {
  formatEnvironmentSummaryLines,
  summarizeEnvironmentDescriptor,
} from "@executioncontrolprotocol/core"
import type { EnvironmentDescriptor } from "@executioncontrolprotocol/types"

const minimalDescriptor: EnvironmentDescriptor = {
  schema: "@executioncontrolprotocol.environment.describe",
  version: "1.0.0",
  environment: { id: "test" },
  runtime: { id: "local", features: {} },
  extensions: [
    { id: "@executioncontrolprotocol/test", order: 0, capabilities: ["@executioncontrolprotocol/test.echo"] },
    { id: "@executioncontrolprotocol/test", order: 1, capabilities: ["@executioncontrolprotocol/test.summarize"] },
  ],
  capabilities: [
    {
      id: "@executioncontrolprotocol/test.echo",
      extension: "@executioncontrolprotocol/test",
      inputSchema: { type: "object", properties: { value: { type: "string" } } },
      outputSchema: { type: "object", properties: { text: { type: "string" } } },
    },
    {
      id: "@executioncontrolprotocol/test.summarize",
      extension: "@executioncontrolprotocol/test",
      inputSchema: { type: "object", properties: { text: { type: "string" } } },
    },
  ],
  policies: [],
}

describe("summarizeEnvironmentDescriptor", () => {
  it("produces smaller JSON than full descriptor", () => {
    const summary = summarizeEnvironmentDescriptor(minimalDescriptor)
    const summaryJson = JSON.stringify(summary)
    const fullJson = JSON.stringify(minimalDescriptor)
    expect(summaryJson.length).toBeLessThan(fullJson.length)
    expect(summary.capabilities.map((c) => c.id)).toContain("@executioncontrolprotocol/test.echo")
    expect(summary.extensions[0]?.id).toBe("@executioncontrolprotocol/test")
  })

  it("formatEnvironmentSummaryLines lists capability ids", () => {
    const summary = summarizeEnvironmentDescriptor(minimalDescriptor)
    const text = formatEnvironmentSummaryLines(summary).join("\n")
    expect(text).toContain("@executioncontrolprotocol/test.echo")
    expect(text).toContain("@executioncontrolprotocol/test.summarize")
  })

  it("formatEnvironmentSummaryLines eql-patch marks caps already in workflow", () => {
    const summary = summarizeEnvironmentDescriptor(minimalDescriptor)
    const text = formatEnvironmentSummaryLines(summary, {
      format: "eql-patch",
      existingCapabilityUses: new Set(["@executioncontrolprotocol/test.echo"]),
    }).join("\n")
    expect(text).toContain("ADD STEP <newStepId> USES @executioncontrolprotocol/test.summarize")
    expect(text).toContain("@executioncontrolprotocol/test.echo (already used by an existing step")
  })

  it("omits format encode/decode and browser host extensions from authoring summary", () => {
    const descriptor: EnvironmentDescriptor = {
      ...minimalDescriptor,
      extensions: [
        ...minimalDescriptor.extensions,
        {
          id: "@executioncontrolprotocol/format-eql",
          order: 2,
          capabilities: ["@executioncontrolprotocol/format-eql.encode"],
        },
        {
          id: "@executioncontrolprotocol/browser-secrets",
          order: 3,
          capabilities: [],
        },
      ],
      capabilities: [
        ...minimalDescriptor.capabilities,
        {
          id: "@executioncontrolprotocol/format-eql.encode",
          extension: "@executioncontrolprotocol/format-eql",
        },
        {
          id: "@executioncontrolprotocol/ollama.listModels",
          extension: "@executioncontrolprotocol/ollama",
        },
      ],
    }
    const summary = summarizeEnvironmentDescriptor(descriptor)
    expect(summary.capabilities.map((c) => c.id)).toEqual([
      "@executioncontrolprotocol/test.echo",
      "@executioncontrolprotocol/test.summarize",
    ])
    expect(summary.extensions.every((e) => e.id === "@executioncontrolprotocol/test")).toBe(true)
    expect(summary.extensions.some((e) => e.id.includes("format-"))).toBe(false)
    const text = formatEnvironmentSummaryLines(summary, { format: "eql-create" }).join("\n")
    expect(text).not.toContain("format-eql")
    expect(text).not.toContain("listModels")
  })
})
