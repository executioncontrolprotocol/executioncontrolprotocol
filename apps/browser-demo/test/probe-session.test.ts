import { describe, expect, it } from "vitest"
import { z } from "zod"
import { capabilityFor } from "@executioncontrolprotocol/core"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import {
  buildProbeContextAfterDiscovery,
  discoveryOutputFromState,
  formatDiscoveryFollowUpMessage,
  prepareDiscoveryWorkflow,
  resolveDiscoveryCapabilityId,
  slimDiscoveryRunResult,
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

  it("prefers an explicit preferredCapabilityId", () => {
    const workflow: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "d" },
      steps: [
        { id: "a", uses: inspect.id, as: "raw" },
        { id: "b", uses: "@other/resize", as: "out" },
      ],
    }
    expect(resolveDiscoveryCapabilityId(workflow, inspect.id)).toBe(inspect.id)
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

  it("prefers an inspect-like step in a multi-step authoring draft", () => {
    const workflow: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "d" },
      steps: [
        { id: "a", uses: inspect.id, as: "raw" },
        { id: "b", uses: "@executioncontrolprotocol/image-sharp.resize", as: "out" },
      ],
    }
    expect(resolveDiscoveryCapabilityId(workflow)).toBe(inspect.id)
  })

  it("falls back to the first step when no inspect-like id exists", () => {
    const workflow: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "d" },
      steps: [
        { id: "a", uses: "@a/one", as: "a" },
        { id: "b", uses: "@a/two", as: "b" },
      ],
    }
    expect(resolveDiscoveryCapabilityId(workflow)).toBe("@a/one")
  })
})

describe("prepareDiscoveryWorkflow", () => {
  it("compiles a one-step discovery workflow from a multi-step authoring draft", () => {
    const workflow: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "authoring" },
      steps: [
        { id: "a", uses: inspect.id, as: "raw" },
        { id: "b", uses: "@executioncontrolprotocol/image-sharp.resize", as: "out" },
      ],
    }
    const prepared = prepareDiscoveryWorkflow(workflow, lookup, inspect.id)
    expect(prepared?.capabilityId).toBe(inspect.id)
    expect(prepared?.workflow.discovery).toEqual({ capabilityId: inspect.id })
    expect(prepared?.workflow.steps).toHaveLength(1)
  })

  it("reuses a marked one-step discovery workflow", () => {
    const workflow: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "d" },
      steps: [{ id: "a", uses: inspect.id, as: "raw" }],
      discovery: { capabilityId: inspect.id },
    }
    const prepared = prepareDiscoveryWorkflow(workflow, lookup)
    expect(prepared?.workflow).toBe(workflow)
  })
})

describe("discovery follow-up and sanitization", () => {
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

  it("builds probe context and slims run results after discovery", () => {
    const output = {
      width: 800,
      height: 600,
      layers: [
        { id: "l1", name: "Headline" },
        { id: "l2", name: "Logo" },
      ],
    }
    const probe = buildProbeContextAfterDiscovery({
      capabilityId: inspect.id,
      output,
    })
    expect(probe.domain).toBe(inspect.id)
    expect(probe.options.length).toBeGreaterThan(0)
    expect(probe.summary).toContain(inspect.id)

    const slim = slimDiscoveryRunResult({
      schema: "@executioncontrolprotocol.run.result",
      version: "1.0",
      run: { id: "r1", status: "completed" },
    })
    expect(slim).toEqual({
      schema: "@executioncontrolprotocol.run.result",
      version: "1.0",
      run: { id: "r1", status: "completed" },
    })
    expect(slim).not.toHaveProperty("state")
    expect(slim).not.toHaveProperty("output")
  })
})
