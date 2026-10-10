import { describe, expect, it } from "vitest"
import { z } from "zod"
import { capabilityFor } from "@executioncontrolprotocol/core"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import {
  discoveryOutputFromState,
  formatDiscoveryFollowUpMessage,
  prepareDiscoveryWorkflow,
  resolveDiscoveryCapabilityId,
} from "../src/lib/probe-session.js"

const inspect = capabilityFor("@executioncontrolprotocol/demo-test", "inspect")
  .withInput(z.object({ source: z.string() }))
  .withOutput(z.object({ width: z.number(), height: z.number() }))
  .withMetadata({
    summary: "Read structure",
    description: "Inspect a document before authoring.",
    useCases: ["Learn size before edit"],
    projections: [
      {
        summary: "Read the image size",
        description: "Read width and height from the top of the result.",
      },
    ],
  })
  .withHandler(async () => ({ width: 1, height: 1 }))

const lookup = {
  getCapability: (id: string) => (id === inspect.id ? inspect : undefined),
}

describe("resolveDiscoveryCapabilityId", () => {
  it("prefers the discovery marker", () => {
    const workflow: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "d" },
      steps: [{ id: "a", uses: "@other/cap", as: "raw" }],
      discovery: { capabilityId: inspect.id },
    }
    expect(resolveDiscoveryCapabilityId(workflow)).toBe(inspect.id)
  })

  it("falls back to a single step uses id", () => {
    const workflow: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "d" },
      steps: [{ id: "a", uses: inspect.id, as: "raw" }],
    }
    expect(resolveDiscoveryCapabilityId(workflow)).toBe(inspect.id)
  })

  it("returns undefined when multiple steps have no marker", () => {
    const workflow: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "d" },
      steps: [
        { id: "a", uses: "@a/one", as: "a" },
        { id: "b", uses: "@a/two", as: "b" },
      ],
    }
    expect(resolveDiscoveryCapabilityId(workflow)).toBeUndefined()
  })
})

describe("prepareDiscoveryWorkflow", () => {
  it("compiles a marked one-step workflow when the marker is missing", () => {
    const workflow: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "d" },
      steps: [{ id: "a", uses: inspect.id, as: "raw" }],
    }
    const prepared = prepareDiscoveryWorkflow(workflow, lookup)
    expect(prepared?.capabilityId).toBe(inspect.id)
    expect(prepared?.workflow.discovery).toEqual({ capabilityId: inspect.id })
    expect(prepared?.workflow.steps).toHaveLength(1)
  })
})

describe("discovery follow-up", () => {
  it("formats projections and reads raw state", () => {
    const message = formatDiscoveryFollowUpMessage({
      capabilityId: inspect.id,
      projections: inspect.metadata?.projections,
      output: { width: 1920, height: 1080 },
    })
    expect(message).toContain("Read the image size")
    expect(message).toContain("1920")
    expect(discoveryOutputFromState({ raw: { width: 1 } })).toEqual({ width: 1 })
  })
})
