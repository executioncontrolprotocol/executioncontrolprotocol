import { describe, expect, it } from "vitest"
import type { EnvironmentDescriptor } from "@executioncontrolprotocol/core/types"
import {
  ENVIRONMENT_EDITOR_PATH,
  environmentSourceFromDescriptor,
} from "../src/host/environment-source.js"

function descriptor(
  overrides: Partial<EnvironmentDescriptor> & {
    environment?: EnvironmentDescriptor["environment"]
  } = {}
): EnvironmentDescriptor {
  return {
    schema: "@executioncontrolprotocol.environment.describe",
    version: "1.0",
    environment: overrides.environment ?? { id: "node" },
    runtime: overrides.runtime ?? { id: "node", features: {} },
    extensions: overrides.extensions ?? [],
    capabilities: overrides.capabilities ?? [],
    policies: overrides.policies ?? [],
  }
}

describe("environmentSourceFromDescriptor", () => {
  it("emits a placeholder when the descriptor is missing", () => {
    const source = environmentSourceFromDescriptor(null)
    expect(source).toContain('environment("unknown").with([])')
    expect(source).toContain("no environment is connected")
  })

  it("renders an empty process host as environment(id).with([])", () => {
    const source = environmentSourceFromDescriptor(descriptor({ environment: { id: "node", label: "local" } }))
    expect(source).toContain("from \"@executioncontrolprotocol/core\"")
    expect(source).toContain('export default environment("node", "local").with([])')
    expect(source).not.toContain("extension(")
    expect(source).not.toContain("policy(")
  })

  it("sorts extensions by order then id and omits config objects", () => {
    const source = environmentSourceFromDescriptor(
      descriptor({
        extensions: [
          {
            id: "@executioncontrolprotocol/jsonata",
            order: 2,
            capabilities: [],
            config: { apiKey: "should-not-appear" },
          },
          {
            id: "@executioncontrolprotocol/test",
            order: 1,
            capabilities: [],
            config: { token: "nope" },
          },
        ],
      })
    )
    expect(source).toContain("import { environment, extension }")
    expect(source.indexOf("@executioncontrolprotocol/test")).toBeLessThan(
      source.indexOf("@executioncontrolprotocol/jsonata")
    )
    expect(source).toContain('  extension("@executioncontrolprotocol/test"),')
    expect(source).toContain('  extension("@executioncontrolprotocol/jsonata"),')
    expect(source).not.toContain("should-not-appear")
    expect(source).not.toContain("apiKey")
    expect(source).not.toContain("token")
    expect(source).not.toContain(".with({")
  })

  it("renders policies without importing extension when none are bound", () => {
    const source = environmentSourceFromDescriptor(
      descriptor({
        policies: [
          { id: "@executioncontrolprotocol/budget", config: { maxCostUsd: 1 } },
          { id: "@executioncontrolprotocol/approval" },
        ],
      })
    )
    expect(source).toContain("import { environment, policy }")
    expect(source).not.toContain("extension")
    expect(source.indexOf("@executioncontrolprotocol/approval")).toBeLessThan(
      source.indexOf("@executioncontrolprotocol/budget")
    )
    expect(source).not.toContain("maxCostUsd")
  })

  it("exports the Environment tab Monaco path", () => {
    expect(ENVIRONMENT_EDITOR_PATH).toBe("file:///ecp-workflow/environment.ts")
  })
})
