import { describe, expect, it } from "vitest"
import { evaluateImageRefsPre, evaluateImageRefsPost } from "../src/image-policy-eval.js"

describe("image-policy eval", () => {
  it("allows file refs when kind is permitted", () => {
    const reason = evaluateImageRefsPre(
      { image: { kind: "file", path: "/tmp/a.png" } },
      { allowedInputKinds: ["file", "artifact"] }
    )
    expect(reason).toBeUndefined()
  })

  it("denies disallowed input kind", () => {
    const reason = evaluateImageRefsPre(
      { image: { kind: "url", url: "https://example.com/a.png" } },
      { allowedInputKinds: ["file"] }
    )
    expect(reason).toMatch(/disallowed kind/)
  })

  it("denies remote URLs when disabled", () => {
    const reason = evaluateImageRefsPre(
      { image: { kind: "url", url: "https://fal.media/x.png" } },
      { allowRemoteUrls: false }
    )
    expect(reason).toMatch(/Remote URL/)
  })

  it("denies URL domain outside allowlist", () => {
    const reason = evaluateImageRefsPre(
      { image: { kind: "url", url: "https://evil.com/x.png" } },
      { allowRemoteUrls: true, allowedUrlDomains: ["fal.media"] }
    )
    expect(reason).toMatch(/allowedUrlDomains/)
  })

  it("enforces maxImageRefsPerStep across nested payloads", () => {
    const reason = evaluateImageRefsPre(
      {
        overlays: [
          { image: { kind: "file", path: "/a.png" } },
          { image: { kind: "file", path: "/b.png" } },
        ],
      },
      { maxImageRefsPerStep: 1 }
    )
    expect(reason).toMatch(/maxImageRefsPerStep/)
  })

  it("denies disallowed output format on post", () => {
    const reason = evaluateImageRefsPost(
      { info: { format: "raw", width: 1, height: 1, channels: 3, sizeBytes: 10 } },
      { allowedOutputFormats: ["webp", "png"] }
    )
    expect(reason).toMatch(/not allowed/)
  })

  it("allows FAL-like wrapped url ref when policy permits", () => {
    const reason = evaluateImageRefsPre(
      {
        image: { kind: "url", url: "https://fal.media/generated.png" },
      },
      {
        allowedInputKinds: ["url", "artifact", "file"],
        allowRemoteUrls: true,
        allowedUrlDomains: ["fal.media"],
      }
    )
    expect(reason).toBeUndefined()
  })
})
