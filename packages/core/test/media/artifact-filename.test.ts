import { describe, expect, it } from "vitest"
import {
  defaultArtifactFilename,
  extensionForMediaType,
  resolveArtifactFilename,
  artifactFetchPathname,
  parseArtifactFetchPathname,
  isArtifactFetchPathname,
} from "../../src/media/artifact-filename.js"

describe("artifact filename helpers", () => {
  it("maps common MIME types to extensions", () => {
    expect(extensionForMediaType("image/png")).toBe("png")
    expect(extensionForMediaType("image/jpeg")).toBe("jpg")
    expect(extensionForMediaType("image/webp")).toBe("webp")
    expect(extensionForMediaType("application/pdf")).toBe("pdf")
  })

  it("derives image/* extensions from the subtype", () => {
    expect(extensionForMediaType("image/x-icon")).toBe("icon")
  })

  it("defaults artifact names from mediaType instead of .bin", () => {
    const name = defaultArtifactFilename("image/png")
    expect(name).toMatch(/^media-\d+\.png$/)
  })

  it("upgrades .bin filenames using mediaType", () => {
    expect(resolveArtifactFilename("media-1.bin", "ecp://artifacts/media/media-1.bin", "image/png")).toBe(
      "media-1.png"
    )
  })

  it("keeps explicit extensions", () => {
    expect(resolveArtifactFilename("photo.webp", "ecp://artifacts/x", "image/png")).toBe("photo.webp")
  })

  it("falls back to uri basename", () => {
    expect(resolveArtifactFilename(undefined, "ecp://artifacts/images/out.webp")).toBe("out.webp")
  })

  it("strips path separators and quotes", () => {
    expect(resolveArtifactFilename('a/"b\\c', "ecp://artifacts/x")).toBe("a_bc")
  })

  it("builds pathname with encoded filename for browser URL hints", () => {
    expect(
      artifactFetchPathname("ecp://artifacts/images/output.webp", {
        name: "output.webp",
        mediaType: "image/webp",
      })
    ).toBe("/v1/artifacts/output.webp")
  })

  it("parses filename segment from artifact fetch pathname", () => {
    expect(parseArtifactFetchPathname("/v1/artifacts/output.webp")).toBe("output.webp")
    expect(parseArtifactFetchPathname("/v1/artifacts")).toBeUndefined()
  })

  it("detects artifact fetch pathnames", () => {
    expect(isArtifactFetchPathname("/v1/artifacts")).toBe(true)
    expect(isArtifactFetchPathname("/v1/artifacts/out.png")).toBe(true)
    expect(isArtifactFetchPathname("/v1/other")).toBe(false)
  })
})
