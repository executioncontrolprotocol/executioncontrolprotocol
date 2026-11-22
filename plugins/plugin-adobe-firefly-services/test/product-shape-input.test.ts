import { describe, expect, it } from "vitest"
import { expandFileRefInputs, expandNestedFileRefPayload } from "../src/runtime/product-shape.js"
import { AdobeServiceError } from "../src/errors.js"

describe("expandFileRefInputs", () => {
  it("expands url FileRef to Adobe image envelope", () => {
    const out = expandFileRefInputs(
      { image: { kind: "url", url: "https://store.test/in.psd", mediaType: "image/vnd.adobe.photoshop" } },
      ["image"],
    )
    expect(out.image).toEqual({ source: { url: "https://store.test/in.psd" } })
  })

  it("rejects file kind with upload hint", () => {
    expect(() =>
      expandFileRefInputs({ image: { kind: "file", path: "/tmp/x.psd" } }, ["image"]),
    ).toThrow(AdobeServiceError)
  })
})

describe("expandNestedFileRefPayload", () => {
  const urlRef = { kind: "url" as const, url: "https://store.test/bg.png" }

  it("expands composite layer image and style imageReference", () => {
    const body = {
      edits: {
        layers: [
          { name: "Bg", type: "layer", image: urlRef },
          { name: "Title", type: "text_layer" },
        ],
      },
      style: { imageReference: urlRef, strength: 50 },
    }
    expect(expandNestedFileRefPayload(body)).toEqual({
      edits: {
        layers: [
          { name: "Bg", type: "layer", image: { source: { url: urlRef.url } } },
          { name: "Title", type: "text_layer" },
        ],
      },
      style: { imageReference: { source: { url: urlRef.url } }, strength: 50 },
    })
  })

  it("expands referenceBlobs source and passes through empty arrays", () => {
    expect(expandNestedFileRefPayload({ referenceBlobs: [] })).toEqual({ referenceBlobs: [] })
    expect(
      expandNestedFileRefPayload({
        referenceBlobs: [{ source: urlRef, usage: "general" }],
      }),
    ).toEqual({
      referenceBlobs: [{ source: { url: urlRef.url }, usage: "general" }],
    })
  })

  it("rejects file kind in nested url-only fields", () => {
    expect(() =>
      expandNestedFileRefPayload({
        style: { imageReference: { kind: "file", path: "/tmp/x.png" } },
      }),
    ).toThrow(AdobeServiceError)
  })
})