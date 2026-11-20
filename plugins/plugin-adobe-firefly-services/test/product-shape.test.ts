import { describe, expect, it } from "vitest"
import { mediaTypeToken, resolveMediaType, shapeAdobeOutput } from "../src/runtime/product-shape.js"

describe("mediaTypeToken", () => {
  it("maps known types and sanitizes unknown subtypes", () => {
    expect(mediaTypeToken("image/png")).toBe("png")
    expect(mediaTypeToken("image/vnd.adobe.photoshop")).toBe("psd")
    expect(mediaTypeToken("application/vnd.foo+bar")).toBe("vnd-foo-bar")
  })
})

describe("resolveMediaType", () => {
  it("prefers response, then request, then URL extension, then default", () => {
    expect(
      resolveMediaType({
        responseMediaType: "image/jpeg",
        requestedMediaType: "image/png",
        url: "https://cdn.test/x.png",
        familyDefault: "image/png",
      }),
    ).toBe("image/jpeg")
    expect(
      resolveMediaType({
        requestedMediaType: "image/png",
        url: "https://cdn.test/x.jpg",
        familyDefault: "image/png",
      }),
    ).toBe("image/png")
    expect(resolveMediaType({ url: "https://cdn.test/out.webp", familyDefault: "image/png" })).toBe("image/webp")
    expect(resolveMediaType({ url: "https://cdn.test/noext", familyDefault: "image/png" })).toBe("image/png")
  })
})

describe("shapeAdobeOutput", () => {
  it("wraps Firefly JobResult outputs as images with seeds", () => {
    const shaped = shapeAdobeOutput(
      { outputs: [{ seed: 1652602238, image: { url: "https://cdn.test/a.png" } }], size: { width: 1, height: 2 } },
      { kind: "image-job", mediaArray: "images" },
      {},
    ) as { images: { url: string; mediaType: string }[]; seeds: number[] }
    expect(shaped.images[0]).toMatchObject({ kind: "url", url: "https://cdn.test/a.png", mediaType: "image/png" })
    expect(shaped.seeds).toEqual([1652602238])
  })

  it("labels an extensionless Firefly image URL as JPEG (what generate-images returns)", () => {
    const shaped = shapeAdobeOutput(
      { outputs: [{ seed: 7, image: { url: "https://pre-signed-firefly-prod.s3.test/images/8f2c-47f5-911f?X-Amz-Signature=x" } }] },
      { kind: "image-job", mediaArray: "images" },
      {},
    ) as { images: { mediaType: string }[] }
    expect(shaped.images[0]?.mediaType).toBe("image/jpeg")
  })

  it("keys Photoshop multi-output by media type token and pairs by index", () => {
    const input = {
      outputs: [{ mediaType: "image/png" }, { mediaType: "image/vnd.adobe.photoshop" }],
    }
    const shaped = shapeAdobeOutput(
      {
        outputs: [
          {
            destination: { url: "https://cdn.test/out.png", mediaType: "image/png" },
            mediaType: "image/png",
          },
          {
            destination: {
              url: "https://cdn.test/out.psd",
              mediaType: "image/vnd.adobe.photoshop",
            },
            mediaType: "image/vnd.adobe.photoshop",
          },
        ],
      },
      { kind: "photoshop-multi" },
      input,
    ) as Record<string, { mediaType: string }>
    expect(shaped.png?.mediaType).toBe("image/png")
    expect(shaped.psd?.mediaType).toBe("image/vnd.adobe.photoshop")
  })

  it("returns manifest document object", () => {
    const doc = { layers: [{ name: "Bg" }], document: { imageMode: "RGB" } }
    const shaped = shapeAdobeOutput(
      { outputs: [{ content: doc, destination: { content: doc, embedded: "json" } }] },
      { kind: "manifest" },
      {},
    )
    expect(shaped).toEqual(doc)
  })
})