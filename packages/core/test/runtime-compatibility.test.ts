import { describe, expect, it, beforeEach } from "vitest"
import { defineExtension, capabilityFor, globalRegistry, catalogExtension } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { validateEnvironmentWithWorkflow } from "../src/validate/environment.js"
import type { EnvironmentDescriptor, WorkflowManifest } from "@executioncontrolprotocol/types"

const nodeOnlyHostExtension = defineExtension("@executioncontrolprotocol", "test-node-only")
  .withSupportedRuntimes(["@executioncontrolprotocol/node"])
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/test-node-only", "echo")
      .withInput(z.object({}))
      .withOutput(z.object({}))
      .withHandler(async () => ({})),
  ])
  .build()

catalogExtension(nodeOnlyHostExtension)

const nodeOnlyLocalExtension = defineExtension("@executioncontrolprotocol", "test-node-local")
  .withSupportedRuntimes(["@executioncontrolprotocol/node"])
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/test-node-local", "echo")
      .withExecution("local")
      .withInput(z.object({}))
      .withOutput(z.object({}))
      .withHandler(async () => ({})),
  ])
  .build()

catalogExtension(nodeOnlyLocalExtension)

const hostWorkflow: WorkflowManifest = {
  schema: "@executioncontrolprotocol.workflow",
  version: "1.0",
  workflow: { id: "t", label: "t" },
  run: [
    {
      type: "step",
      id: "s1",
      capability: "@executioncontrolprotocol/test-node-only.echo",
      as: "out",
    },
  ],
}

const localWorkflow: WorkflowManifest = {
  schema: "@executioncontrolprotocol.workflow",
  version: "1.0",
  workflow: { id: "t", label: "t" },
  run: [
    {
      type: "step",
      id: "s1",
      capability: "@executioncontrolprotocol/test-node-local.echo",
      as: "out",
    },
  ],
}

function descriptor(
  runtimeId: string,
  extId: string,
  capabilityId: string,
  supportedRuntimes: string[]
): EnvironmentDescriptor {
  return {
    schema: "@executioncontrolprotocol.environment.describe",
    version: "1.0",
    environment: { id: "test" },
    runtime: { id: runtimeId, features: {} },
    extensions: [
      {
        id: extId,
        order: 0,
        capabilities: [capabilityId],
        supportedRuntimes,
      },
    ],
    capabilities: [
      {
        id: capabilityId,
        extension: extId,
      },
    ],
    policies: [],
  }
}

describe("runtime compatibility", () => {
  beforeEach(async () => {
    if (!globalRegistry.getExtension("@executioncontrolprotocol/test-node-only")) {
      await globalRegistry.registerExtension(nodeOnlyHostExtension)
    }
    if (!globalRegistry.getExtension("@executioncontrolprotocol/test-node-local")) {
      await globalRegistry.registerExtension(nodeOnlyLocalExtension)
    }
  })

  it("allows node-only host catalog on browser runtime (hop)", () => {
    const result = validateEnvironmentWithWorkflow(
      hostWorkflow,
      descriptor(
        "@executioncontrolprotocol/browser",
        "@executioncontrolprotocol/test-node-only",
        "@executioncontrolprotocol/test-node-only.echo",
        ["@executioncontrolprotocol/node"]
      ),
      {
        runtime: { id: "@executioncontrolprotocol/browser", config: {} },
        extensions: [{ id: "@executioncontrolprotocol/test-node-only", config: {}, order: 0 }],
        policies: [],
        harnesses: [],
      }
    )
    expect(result.errors.some((e) => e.code === "UNSUPPORTED_RUNTIME_EXTENSION")).toBe(false)
  })

  it("denies node-only local capability on browser runtime", () => {
    const result = validateEnvironmentWithWorkflow(
      localWorkflow,
      descriptor(
        "@executioncontrolprotocol/browser",
        "@executioncontrolprotocol/test-node-local",
        "@executioncontrolprotocol/test-node-local.echo",
        ["@executioncontrolprotocol/node"]
      ),
      {
        runtime: { id: "@executioncontrolprotocol/browser", config: {} },
        extensions: [{ id: "@executioncontrolprotocol/test-node-local", config: {}, order: 0 }],
        policies: [],
        harnesses: [],
      }
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === "UNSUPPORTED_RUNTIME_EXTENSION")).toBe(true)
  })

  it("allows node-only extension on node runtime", () => {
    const result = validateEnvironmentWithWorkflow(
      hostWorkflow,
      descriptor(
        "@executioncontrolprotocol/node",
        "@executioncontrolprotocol/test-node-only",
        "@executioncontrolprotocol/test-node-only.echo",
        ["@executioncontrolprotocol/node"]
      ),
      {
        runtime: { id: "@executioncontrolprotocol/node", config: {} },
        extensions: [{ id: "@executioncontrolprotocol/test-node-only", config: {}, order: 0 }],
        policies: [],
        harnesses: [],
      }
    )
    expect(result.errors.some((e) => e.code === "UNSUPPORTED_RUNTIME_EXTENSION")).toBe(false)
  })
})
