import { describe, expect, it } from "vitest"
import { expandFileRefInputs } from "../src/runtime/product-shape.js"
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