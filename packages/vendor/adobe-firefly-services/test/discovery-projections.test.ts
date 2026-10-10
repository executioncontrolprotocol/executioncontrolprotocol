import { describe, expect, it } from "vitest"
import {
  PHOTOSHOP_GENERATE_MANIFEST_ID,
  withPhotoshopDiscoveryProjections,
} from "../src/discovery-projections.js"
import { adobeGeneratedCapabilities } from "../src/generated/index.js"

describe("withPhotoshopDiscoveryProjections", () => {
  it("attaches plain-text projections to photoshop-generate-manifest", () => {
    const next = withPhotoshopDiscoveryProjections([...adobeGeneratedCapabilities])
    const cap = next.find((c) => c.id === PHOTOSHOP_GENERATE_MANIFEST_ID)
    expect(cap?.metadata?.projections?.length).toBeGreaterThan(0)
    expect(cap?.metadata?.projections?.[0]?.summary).toMatch(/visible layers/i)
    expect(cap?.metadata).not.toHaveProperty("samplePrompts")
  })

  it("leaves other capabilities unchanged aside from parse strip", () => {
    const next = withPhotoshopDiscoveryProjections([...adobeGeneratedCapabilities])
    const other = next.find(
      (c) => c.id !== PHOTOSHOP_GENERATE_MANIFEST_ID && c.metadata
    )
    expect(other?.metadata?.projections).toBeUndefined()
  })
})
