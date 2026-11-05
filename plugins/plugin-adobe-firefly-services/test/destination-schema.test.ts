import { describe, expect, it } from "vitest"
import {
  Schema_CreativeCloudDestination,
  Schema_EmbeddedDestination,
  Schema_HostedDestination,
  Schema_ManifestOutput,
  Schema_UrlDestination,
} from "../src/generated/photoshop/schemas.js"
import { withDefaultManifestOutputs } from "../src/runtime/photoshop-manifest.js"

describe("Photoshop destination oneOf (strict objects)", () => {
  it("keeps embedded json destination unchanged", () => {
    const parsed = Schema_EmbeddedDestination.parse({ embedded: "json" })
    expect(parsed).toEqual({ embedded: "json" })
  })

  it("keeps hosted validityPeriod unchanged", () => {
    const parsed = Schema_HostedDestination.parse({ validityPeriod: 3600 })
    expect(parsed).toEqual({ validityPeriod: 3600 })
  })

  it("keeps url resource destination unchanged", () => {
    const parsed = Schema_UrlDestination.parse({
      storageType: "azure",
      url: "https://blob.example/m.json",
    })
    expect(parsed).toEqual({
      storageType: "azure",
      url: "https://blob.example/m.json",
    })
  })

  it("rejects embedded keys on the creative-cloud arm", () => {
    const result = Schema_CreativeCloudDestination.safeParse({ embedded: "json" })
    expect(result.success).toBe(false)
  })

  it("round-trips ManifestOutput with embedded destination", () => {
    const value = {
      destination: { embedded: "json" },
      mediaType: "application/json",
    }
    expect(Schema_ManifestOutput.parse(value)).toEqual(value)
  })
})

describe("withDefaultManifestOutputs", () => {
  it("defaults outputs when omitted", () => {
    expect(withDefaultManifestOutputs({ image: { url: "https://x" } })).toEqual({
      image: { url: "https://x" },
      outputs: [
        {
          destination: { embedded: "json" },
          mediaType: "application/json",
        },
      ],
    })
  })

  it("preserves explicit outputs", () => {
    const input = {
      image: { url: "https://x" },
      outputs: [
        {
          destination: { validityPeriod: 3600 },
          mediaType: "application/json",
        },
      ],
    }
    expect(withDefaultManifestOutputs(input)).toBe(input)
  })
})
