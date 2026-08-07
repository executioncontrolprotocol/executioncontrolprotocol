import { describe, expect, it, beforeEach } from "vitest"
import { defineExtension, capabilityFor, globalRegistry, catalogExtension } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { validateEnvironmentWithWorkflow } from "../src/validate/environment.js"
import type { EnvironmentDescriptor, WorkflowManifest } from "@executioncontrolprotocol/types"

const nodeOnlyExtension = defineExtension("@executioncontrolprotocol", "test-node-only")
  .withSupportedRuntimes(["@executioncontrolprotocol/node"])
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/test-node-only", "echo")
      .withInput(z.object({}))
      .withOutput(z.object({}))
      .withHandler(async () => ({})),
  ])
  .build()

catalogExtension(nodeOnlyExtension)

const workflow: WorkflowManifest = {
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

const descriptor = (runtimeId: string): EnvironmentDescriptor => ({
  schema: "@executioncontrolprotocol.environment.describe",
  version: "1.0",
  environment: { id: "test" },
  runtime: { id: runtimeId, features: {} },
  extensions: [
    {
      id: "@executioncontrolprotocol/test-node-only",
      order: 0,
      capabilities: ["@executioncontrolprotocol/test-node-only.echo"],
      supportedRuntimes: ["@executioncontrolprotocol/node"],
    },
  ],
  capabilities: [
    {
      id: "@executioncontrolprotocol/test-node-only.echo",
      extension: "@executioncontrolprotocol/test-node-only",
    },
  ],
  policies: [],
})

describe("runtime compatibility", () => {
  beforeEach(async () => {
    if (!globalRegistry.getExtension("@executioncontrolprotocol/test-node-only")) {
      await globalRegistry.registerExtension(nodeOnlyExtension)
    }
  })

  it("denies node-only extension on browser runtime", () => {
    const result = validateEnvironmentWithWorkflow(workflow, descriptor("@executioncontrolprotocol/browser"), {
      runtime: { id: "@executioncontrolprotocol/browser", config: {} },
      extensions: [{ id: "@executioncontrolprotocol/test-node-only", config: {}, order: 0 }],
      policies: [],
      harnesses: [],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === "UNSUPPORTED_RUNTIME_EXTENSION")).toBe(true)
  })

  it("allows node-only extension on node runtime", () => {
    const result = validateEnvironmentWithWorkflow(workflow, descriptor("@executioncontrolprotocol/node"), {
      runtime: { id: "@executioncontrolprotocol/node", config: {} },
      extensions: [{ id: "@executioncontrolprotocol/test-node-only", config: {}, order: 0 }],
      policies: [],
      harnesses: [],
    })
    expect(result.errors.some((e) => e.code === "UNSUPPORTED_RUNTIME_EXTENSION")).toBe(false)
  })
})
