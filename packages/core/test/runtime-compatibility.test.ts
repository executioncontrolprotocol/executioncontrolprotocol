import { describe, expect, it, beforeEach } from "vitest"
import { defineExtension, capabilityFor, Registry } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { validateEnvironmentWithWorkflow, ECP_ENVIRONMENT_UNSUPPORTED } from "../src/validate/environment.js"
import type { EnvironmentDescriptor, WorkflowManifest } from "@executioncontrolprotocol/core/types"
import type { ResolvedBindings } from "../src/environment/bindings.js"

const nodeOnlyHostExtension = defineExtension("@executioncontrolprotocol", "test-node-only")
  .supports("@executioncontrolprotocol/node")
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/test-node-only", "echo")
      .withInput(z.object({}))
      .withOutput(z.object({}))
      .withHandler(async () => ({})),
  ])
  .build()

const nodeOnlyLocalExtension = defineExtension("@executioncontrolprotocol", "test-node-local")
  .supports("@executioncontrolprotocol/node")
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/test-node-local", "echo")
      .withExecution("local")
      .withInput(z.object({}))
      .withOutput(z.object({}))
      .withHandler(async () => ({})),
  ])
  .build()

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
  environmentId: string,
  extId: string,
  capabilityId: string,
  supportedEnvironments: string[]
): EnvironmentDescriptor {
  return {
    schema: "@executioncontrolprotocol.environment.describe",
    version: "1.0",
    environment: { id: environmentId },
    runtime: { id: environmentId, features: {} },
    extensions: [
      {
        id: extId,
        order: 0,
        capabilities: [capabilityId],
        supportedEnvironments,
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

function bindings(environmentId: string, extId: string): ResolvedBindings {
  return {
    runtime: { id: environmentId as never, config: {} },
    extensions: [{ id: extId as never, config: {}, order: 0 }],
    policies: [],
    extensionHooks: [],
    policyHooks: [],
  }
}

describe("environment compatibility", () => {
  const registry = new Registry()

  beforeEach(async () => {
    if (!registry.getExtension("@executioncontrolprotocol/test-node-only")) {
      await registry.registerExtension(nodeOnlyHostExtension)
    }
    if (!registry.getExtension("@executioncontrolprotocol/test-node-local")) {
      await registry.registerExtension(nodeOnlyLocalExtension)
    }
  })

  it("allows node-only host catalog on browser environment (hop)", () => {
    const result = validateEnvironmentWithWorkflow(
      hostWorkflow,
      descriptor(
        "@executioncontrolprotocol/browser",
        "@executioncontrolprotocol/test-node-only",
        "@executioncontrolprotocol/test-node-only.echo",
        ["@executioncontrolprotocol/node"]
      ),
      bindings("@executioncontrolprotocol/browser", "@executioncontrolprotocol/test-node-only"),
      registry
    )
    expect(result.errors.some((e) => e.code === ECP_ENVIRONMENT_UNSUPPORTED)).toBe(false)
  })

  it("denies node-only local capability on browser environment", () => {
    const result = validateEnvironmentWithWorkflow(
      localWorkflow,
      descriptor(
        "@executioncontrolprotocol/browser",
        "@executioncontrolprotocol/test-node-local",
        "@executioncontrolprotocol/test-node-local.echo",
        ["@executioncontrolprotocol/node"]
      ),
      bindings("@executioncontrolprotocol/browser", "@executioncontrolprotocol/test-node-local"),
      registry
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === ECP_ENVIRONMENT_UNSUPPORTED)).toBe(true)
  })

  it("allows node-only extension on node environment", () => {
    const result = validateEnvironmentWithWorkflow(
      hostWorkflow,
      descriptor(
        "@executioncontrolprotocol/node",
        "@executioncontrolprotocol/test-node-only",
        "@executioncontrolprotocol/test-node-only.echo",
        ["@executioncontrolprotocol/node"]
      ),
      bindings("@executioncontrolprotocol/node", "@executioncontrolprotocol/test-node-only"),
      registry
    )
    expect(result.errors.some((e) => e.code === ECP_ENVIRONMENT_UNSUPPORTED)).toBe(false)
  })
})
