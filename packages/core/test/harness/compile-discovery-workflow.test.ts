import { describe, expect, it } from "vitest"
import { z } from "zod"
import { capabilityFor } from "../../src/definitions/capability.js"
import {
  capDiscoveryExcerpt,
  compileDiscoveryWorkflow,
  DISCOVERY_RAW_STEP_AS,
  formatDiscoveryFollowUpLines,
  formatProjectionsForPrompt,
} from "../../src/harness/authoring/compile-discovery-workflow.js"
import { parseCapabilityMetadata } from "@executioncontrolprotocol/types"

describe("compileDiscoveryWorkflow", () => {
  const inspect = capabilityFor("@executioncontrolprotocol/discovery-test", "inspect")
    .withInput(
      z.object({
        source: z.string(),
        detail: z.string().optional(),
      })
    )
    .withOutput(
      z.object({
        width: z.number(),
        height: z.number(),
        parts: z.array(z.object({ id: z.string(), name: z.string() })),
      })
    )
    .withMetadata({
      summary: "Read a document and return its structure",
      description: "Call while authoring when the next steps depend on what is inside.",
      useCases: ["Inspect a file before choosing which part to edit"],
      projections: [
        {
          summary: "Retrieve all visible layers",
          description:
            "Look through the document layers and keep each one whose visible field is true.",
        },
        {
          summary: "Read the image size",
          description: "Read width and height from the top of the result.",
        },
      ],
    })
    .withHandler(async () => ({ width: 1, height: 1, parts: [] }))

  const lookup = {
    getCapability: (id: string) => (id === inspect.id ? inspect : undefined),
  }

  it("copies input schema onto accepts and emits one ref per top-level field", () => {
    const manifest = compileDiscoveryWorkflow(inspect.id, lookup)
    expect(manifest.discovery).toEqual({ capabilityId: inspect.id })
    expect(manifest.steps).toHaveLength(1)
    expect(manifest.steps[0]).toMatchObject({
      uses: inspect.id,
      as: DISCOVERY_RAW_STEP_AS,
    })
    expect(manifest.workflow.accepts).toMatchObject({
      type: "object",
      properties: {
        source: { type: "string" },
        detail: { type: "string" },
      },
    })
    const input = (manifest.steps[0] as { input?: Record<string, unknown> }).input
    expect(input?.source).toEqual({ $ref: "state.source" })
    expect(input?.detail).toEqual({ $ref: "state.detail" })
  })

  it("rejects unknown capability ids", () => {
    expect(() => compileDiscoveryWorkflow("@missing/capability", lookup)).toThrow(
      /Unknown capability/
    )
  })

  it("does not emit a transform step", () => {
    const manifest = compileDiscoveryWorkflow(inspect.id, lookup)
    expect(manifest.steps.every((step) => !String((step as { uses?: string }).uses).includes("jsonata"))).toBe(
      true
    )
  })
})

describe("projection metadata and excerpts", () => {
  it("parses projections and rejects banned prose", () => {
    const meta = parseCapabilityMetadata({
      summary: "Inspect",
      description: "Read structure",
      useCases: ["Learn parts before authoring"],
      projections: [
        {
          summary: "Read size",
          description: "Read width and height from the top of the result.",
        },
      ],
    })
    expect(meta.projections).toHaveLength(1)
    expect(meta).not.toHaveProperty("samplePrompts")
    expect(meta).not.toHaveProperty("examples")

    expect(() =>
      parseCapabilityMetadata({
        summary: "Inspect",
        description: "Read structure",
        useCases: ["Learn parts"],
        projections: [
          {
            summary: "Bad",
            description: "Read the inputSchema carefully",
          },
        ],
      })
    ).toThrow(/inputschema/i)
  })

  it("strips legacy samplePrompts and examples", () => {
    const meta = parseCapabilityMetadata({
      summary: "Inspect",
      description: "Read structure",
      useCases: ["Learn parts"],
      samplePrompts: ["old"],
      examples: [{ width: 1 }],
    })
    expect(meta).not.toHaveProperty("samplePrompts")
    expect(meta).not.toHaveProperty("examples")
  })

  it("formats projections and caps large excerpts", () => {
    const lines = formatProjectionsForPrompt([
      {
        summary: "Read size",
        description: "Read width and height from the top of the result.",
      },
    ])
    expect(lines.join("\n")).toContain("Read size")
    expect(lines.join("\n")).toContain("width and height")

    const big = { layers: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `L${i}` })) }
    const excerpt = capDiscoveryExcerpt(big, 200)
    expect(excerpt.length).toBeLessThanOrEqual(200)
    expect(excerpt).toContain("truncated")

    const followUp = formatDiscoveryFollowUpLines({
      capabilityId: "@executioncontrolprotocol/discovery-test.inspect",
      projections: [
        {
          summary: "Read size",
          description: "Read width and height from the top of the result.",
        },
      ],
      output: { width: 1920, height: 1080 },
    })
    expect(followUp.join("\n")).toContain("Discovery capability:")
    expect(followUp.join("\n")).toContain("1920")
  })
})
