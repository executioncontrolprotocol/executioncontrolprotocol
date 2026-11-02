import { describe, expect, it } from "vitest"
import type {
  CapabilityDescription,
  EnvironmentDescriptor,
  ExtensionDescription,
} from "@executioncontrolprotocol/core/types"
import {
  authorableCapabilityGroups,
  capabilitySchemasFromDescriptor,
} from "../src/ui/lib/capability-catalog.js"

function descriptor(args: {
  extensions: ExtensionDescription[]
  capabilities: CapabilityDescription[]
}): EnvironmentDescriptor {
  return {
    schema: "@executioncontrolprotocol.environment.describe",
    version: "1.0",
    environment: { id: "@executioncontrolprotocol/node" },
    runtime: {
      id: "@executioncontrolprotocol/node",
      features: {
        loops: true,
        parallel: true,
        branches: true,
        pauses: true,
        cancellation: true,
      },
    },
    extensions: args.extensions,
    capabilities: args.capabilities,
    policies: [],
  }
}

const jsonata: ExtensionDescription = {
  id: "@executioncontrolprotocol/jsonata",
  label: "JSONata",
  summary: "Transform JSON payloads",
  order: 0,
  capabilities: ["@executioncontrolprotocol/jsonata.transform"],
}

const testExt: ExtensionDescription = {
  id: "@executioncontrolprotocol/test",
  label: "Test",
  summary: "Stub capabilities",
  order: 1,
  capabilities: ["@executioncontrolprotocol/test.echo", "@executioncontrolprotocol/test.summarize"],
}

const formatJson: ExtensionDescription = {
  id: "@executioncontrolprotocol/format-json",
  label: "JSON",
  order: 2,
  capabilities: ["@executioncontrolprotocol/format-json.encode"],
  isAuthorable: false,
}

const transform: CapabilityDescription = {
  id: "@executioncontrolprotocol/jsonata.transform",
  label: "transform",
  summary: "Evaluate a JSONata expression",
  extension: jsonata.id,
  inputSchema: { type: "object", properties: { expression: { type: "string" } } },
  metadata: { summary: "Evaluate a JSONata expression", description: "Run an expression on JSON", useCases: [], projections: [] },
}

const echo: CapabilityDescription = {
  id: "@executioncontrolprotocol/test.echo",
  label: "echo",
  summary: "Return the input value unchanged.",
  extension: testExt.id,
  inputSchema: { type: "object", properties: { value: {} } },
  outputSchema: { type: "object", properties: { echo: {} } },
}

const summarize: CapabilityDescription = {
  id: "@executioncontrolprotocol/test.summarize",
  label: "summarize",
  summary: "Placeholder summarize step",
  extension: testExt.id,
}

const encodeJson: CapabilityDescription = {
  id: "@executioncontrolprotocol/format-json.encode",
  label: "encode",
  extension: formatJson.id,
}

const catalog = descriptor({
  extensions: [testExt, jsonata, formatJson],
  capabilities: [summarize, transform, echo, encodeJson],
})

describe("authorableCapabilityGroups", () => {
  it("lists every authorable capability grouped and sorted", () => {
    const groups = authorableCapabilityGroups(catalog, "")
    expect(groups.map((g) => g.extension.id)).toEqual([
      "@executioncontrolprotocol/jsonata",
      "@executioncontrolprotocol/test",
    ])
    expect(groups[0]!.capabilities.map((c) => c.id)).toEqual([
      "@executioncontrolprotocol/jsonata.transform",
    ])
    expect(groups[1]!.capabilities.map((c) => c.id)).toEqual([
      "@executioncontrolprotocol/test.echo",
      "@executioncontrolprotocol/test.summarize",
    ])
  })

  it("omits isAuthorable false extensions", () => {
    const ids = authorableCapabilityGroups(catalog, "").flatMap((g) =>
      g.capabilities.map((c) => c.id)
    )
    expect(ids).not.toContain("@executioncontrolprotocol/format-json.encode")
  })

  it("matches capability name, description, and plugin tokens", () => {
    expect(
      authorableCapabilityGroups(catalog, "jsonata expression").flatMap((g) =>
        g.capabilities.map((c) => c.id)
      )
    ).toEqual(["@executioncontrolprotocol/jsonata.transform"])
    expect(
      authorableCapabilityGroups(catalog, "stub").flatMap((g) => g.capabilities.map((c) => c.id))
    ).toEqual([
      "@executioncontrolprotocol/test.echo",
      "@executioncontrolprotocol/test.summarize",
    ])
    expect(authorableCapabilityGroups(catalog, "no-such-plugin")).toEqual([])
  })

  it("returns no groups for a missing descriptor", () => {
    expect(authorableCapabilityGroups(undefined)).toEqual([])
  })
})

describe("capabilitySchemasFromDescriptor", () => {
  it("indexes JSON Schema I/O by capability id", () => {
    const index = capabilitySchemasFromDescriptor(catalog)
    expect(index["@executioncontrolprotocol/test.echo"]?.outputSchema).toMatchObject({
      type: "object",
      properties: { echo: {} },
    })
    expect(index["@executioncontrolprotocol/test.summarize"]).toBeUndefined()
  })
})
