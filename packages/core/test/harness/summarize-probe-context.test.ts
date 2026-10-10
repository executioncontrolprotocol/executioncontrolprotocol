import { describe, expect, it } from "vitest"
import {
  messageSelectsProbeOptions,
  summarizeProbeContext,
} from "../../src/harness/authoring/summarize-probe-context.js"

describe("summarizeProbeContext", () => {
  it("lists option labels and ids", () => {
    const lines = summarizeProbeContext({
      probeId: "p1",
      domain: "parts",
      summary: "Found 2 parts",
      options: [
        { id: "a", label: "Headline" },
        { id: "b", label: "Logo" },
      ],
    })
    expect(lines.join("\n")).toContain("Headline (id=a)")
    expect(lines.join("\n")).toContain("Logo (id=b)")
  })

  it("handles empty options and truncates large lists", () => {
    expect(
      summarizeProbeContext({
        probeId: "p1",
        domain: "x",
        summary: "none",
        options: [],
      }).join("\n")
    ).toContain("(none)")

    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `id-${i}`,
      label: `Layer ${i}`,
    }))
    const joined = summarizeProbeContext({
      probeId: "p1",
      domain: "x",
      summary: "many",
      options: many,
    }).join("\n")
    expect(joined).toContain("and 6 more")
  })
})

describe("messageSelectsProbeOptions", () => {
  it("detects selections from labels and ids", () => {
    const probe = {
      probeId: "probe-1",
      domain: "parts",
      summary: "2 options",
      stepAs: "raw",
      options: [
        { id: "h1", label: "Headline" },
        { id: "l1", label: "Logo" },
      ],
    }
    expect(messageSelectsProbeOptions("Use Headline and Logo", probe)).toBe(true)
    expect(messageSelectsProbeOptions("make it better", probe)).toBe(false)
  })
})
