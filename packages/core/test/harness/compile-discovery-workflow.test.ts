import { describe, expect, it } from "vitest"
import { z } from "zod"
import { capabilityFor } from "../../src/definitions/capability.js"
import {
  buildProbeContextFromDiscovery,
  capDiscoveryExcerpt,
  compileDiscoveryWorkflow,
  DISCOVERY_RAW_STEP_AS,
  formatDiscoveryFollowUpLines,
  formatProjectionsForPrompt,
  isDiscoveryExcerptTruncated,
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

  it("rejects legacy samplePrompts and examples", () => {
    expect(() =>
      parseCapabilityMetadata({
        summary: "Inspect",
        description: "Read structure",
        useCases: ["Learn parts"],
        projections: [
          {
            summary: "Read size",
            description: "Read width and height from the top of the result.",
          },
        ],
        samplePrompts: ["old"],
        examples: [{ width: 1 }],
      })
    ).toThrow()
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
    // Compact summary bounds arrays; hard truncation adds …[truncated] only when still over budget.
    expect(excerpt.includes("truncated") || excerpt.includes("…+")).toBe(true)

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

  it("compacts image-sharp-like inspect payloads under the default 800 char cap", () => {
    const payload = {
      width: 4032,
      height: 3024,
      format: "jpeg",
      sizeBytes: 4_200_000,
      metadata: {
        exif: Object.fromEntries(
          Array.from({ length: 80 }, (_, i) => [`tag${i}`, `value-${i}-${"x".repeat(40)}`])
        ),
        icc: { profile: "x".repeat(500) },
        stats: { channels: Array.from({ length: 40 }, (_, i) => ({ i, mean: i })) },
      },
    }
    const excerpt = capDiscoveryExcerpt(payload)
    expect(excerpt.length).toBeLessThanOrEqual(800)
    expect(excerpt).toContain("4032")
    expect(excerpt).toContain("3024")
    expect(excerpt).toContain("jpeg")
    expect(excerpt).not.toMatch(/\n\s+"/)
    if (excerpt.length === 800 || excerpt.includes("truncated")) {
      expect(excerpt).toContain("truncated")
    }
  })

  it("builds probe context from projections and compact excerpt without bag allowlists", () => {
    const projections = [
      {
        summary: "Read dimensions and format",
        description: "Take width, height, and format from the result.",
      },
    ]
    const payload = {
      width: 4032,
      height: 3024,
      format: "jpeg",
      metadata: {
        dump: "x".repeat(5000),
      },
    }
    const { probeContext, excerptTruncated } = buildProbeContextFromDiscovery({
      capabilityId: "@executioncontrolprotocol/discovery-test.inspect",
      output: payload,
      projections,
    })
    expect(probeContext.options).toEqual([])
    expect(probeContext.summary).toContain("Read dimensions and format")
    expect(probeContext.summary).toContain("4032")
    expect(probeContext.summary).toContain("3024")
    expect(probeContext.summary).toContain("jpeg")
    expect(probeContext.summary).not.toMatch(/\blayers\b/)
    expect(typeof excerptTruncated).toBe("boolean")
  })

  it("flags truncation for huge payloads and still yields a valid probe context", () => {
    // Many top-level keys so compact JSON still exceeds the 800-char excerpt budget.
    const huge = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`field${i}`, `value-${i}-${"z".repeat(20)}`])
    )
    const { probeContext, excerptTruncated } = buildProbeContextFromDiscovery({
      capabilityId: "@executioncontrolprotocol/discovery-test.inspect",
      output: huge,
      projections: [
        {
          summary: "Read id",
          description: "Take the document id from the result.",
        },
      ],
    })
    expect(excerptTruncated).toBe(true)
    expect(isDiscoveryExcerptTruncated(probeContext.summary) || excerptTruncated).toBe(true)
    expect(probeContext.summary).toContain("Read id")
    expect(probeContext.options).toEqual([])
  })

  it("builds probe context with capability id when projections are missing", () => {
    const { probeContext, excerptTruncated } = buildProbeContextFromDiscovery({
      capabilityId: "@executioncontrolprotocol/discovery-test.inspect",
      output: undefined,
    })
    expect(excerptTruncated).toBe(false)
    expect(probeContext.summary).toContain("@executioncontrolprotocol/discovery-test.inspect")
    expect(probeContext.options).toEqual([])
  })
})
