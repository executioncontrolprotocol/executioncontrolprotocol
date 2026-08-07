import { describe, expect, it } from "vitest"
import { decodeWorkflow, encodeWorkflow, loadWorkflowFixture } from "./helpers.js"

const workflowFixtures = ["echo-workflow", "two-step-chain", "ref-state-workflow"] as const

describe("EQL workflow round-trip", () => {
  for (const name of workflowFixtures) {
    it(`round-trips ${name}`, () => {
      const manifest = loadWorkflowFixture(name)
      const encoded = encodeWorkflow(manifest)
      expect(encoded.success).toBe(true)

      const decoded = decodeWorkflow(encoded.result!)
      expect(decoded.success).toBe(true)
      expect(decoded.result).toEqual(manifest)
    })
  }

  it("round-trips without header when targetSchema is explicit", () => {
    const manifest = loadWorkflowFixture("echo-workflow")
    const encoded = encodeWorkflow(manifest, { headers: false })
    expect(encoded.result).not.toMatch(/^ECP /m)

    const decoded = decodeWorkflow(encoded.result!, { headers: false })
    expect(decoded.success).toBe(true)
    expect(decoded.result).toEqual(manifest)
  })
})
