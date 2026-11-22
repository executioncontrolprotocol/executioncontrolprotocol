import { describe, expect, it, vi } from "vitest"
import { captureStepOutput } from "../src/execute/capture-output.js"

describe("captureStepOutput item paths", () => {
  it("names artifacts with the forEach item path", async () => {
    const delegate = vi.fn(async (input) => ({
      record: { path: input.outputPath, source: { kind: "file" as const, path: "/x" } },
    }))
    await captureStepOutput(
      { file: { kind: "file", path: "a.png", mediaType: "image/png" } },
      {
        stepId: "render",
        items: [2, 4],
        round: 1,
        persist: true,
        runId: "r",
        delegate,
      },
    )
    expect(delegate.mock.calls[0]?.[0].artifactName).toContain("render-i2.4-r1")
  })
})