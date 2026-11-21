import { describe, expect, it } from "vitest"
import { mediaTypesEqual, shouldSniffMediaType, sniffMediaType } from "../src/plugins/sniff.js"

describe("sniffMediaType", () => {
  it("detects PNG and ignores application/json sniffing", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(sniffMediaType(png)).toBe("image/png")
    expect(shouldSniffMediaType("application/json")).toBe(false)
    expect(shouldSniffMediaType("text/plain")).toBe(false)
  })

  it("matches media types ignoring parameters", () => {
    expect(mediaTypesEqual("image/png", "image/png; charset=binary")).toBe(true)
    expect(mediaTypesEqual(undefined, "image/png")).toBe(false)
  })

  it("detects MP4 and ZIP signatures", () => {
    const mp4 = new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70])
    expect(sniffMediaType(mp4)).toBe("video/mp4")
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    expect(sniffMediaType(zip)).toBe("application/zip")
  })
})