import { describe, expect, it } from "vitest"
import { AdobeServiceError } from "../src/errors.js"
import {
  expandFileRefInputs,
  mediaTypeToken,
  resolveMediaType,
  shapeAdobeOutput,
  type AdobeProductShape,
} from "../src/runtime/product-shape.js"

const imageJob: AdobeProductShape = { kind: "image-job", mediaArray: "images" }
const videoJob: AdobeProductShape = { kind: "video-job", mediaArray: "videos" }

describe("mediaTypeToken edge cases", () => {
  it("handles case, jpg aliases, missing slash and empty subtypes", () => {
    expect(mediaTypeToken("IMAGE/PNG")).toBe("png")
    expect(mediaTypeToken("image/jpg")).toBe("jpeg")
    expect(mediaTypeToken("application/pdf")).toBe("pdf")
    expect(mediaTypeToken("image/svg+xml")).toBe("svg-xml")
    expect(mediaTypeToken("octet")).toBe("file")
    expect(mediaTypeToken("image/")).toBe("file")
  })
})

describe("resolveMediaType order", () => {
  it("prefers the response, then the request, then the URL extension, then the family default", () => {
    const url = "https://cdn.test/a.png"
    expect(resolveMediaType({ responseMediaType: "image/webp", requestedMediaType: "image/jpeg", url })).toBe("image/webp")
    expect(resolveMediaType({ requestedMediaType: "image/jpeg", url })).toBe("image/jpeg")
    expect(resolveMediaType({ url })).toBe("image/png")
    expect(resolveMediaType({ url: "https://cdn.test/x", familyDefault: "video/mp4" })).toBe("video/mp4")
    expect(resolveMediaType({ url: "not a url" })).toBe("application/octet-stream")
  })

  it.each([
    ["a.jpg", "image/jpeg"],
    ["a.jpeg", "image/jpeg"],
    ["a.webp", "image/webp"],
    ["a.psd", "image/vnd.adobe.photoshop"],
    ["a.pdf", "application/pdf"],
    ["a.mp4", "video/mp4"],
    ["a.mp3", "audio/mpeg"],
  ])("reads %s from the URL path", (file, mediaType) => {
    expect(resolveMediaType({ url: `https://cdn.test/out/${file}?sig=1` })).toBe(mediaType)
  })
})

describe("shapeAdobeOutput by kind", () => {
  it("passes through without a shape, for passthrough, and for non-object results", () => {
    expect(shapeAdobeOutput({ a: 1 }, undefined, {})).toEqual({ a: 1 })
    expect(shapeAdobeOutput({ a: 1 }, { kind: "passthrough" }, {})).toEqual({ a: 1 })
    expect(shapeAdobeOutput([1, 2], imageJob, {})).toEqual([1, 2])
    expect(shapeAdobeOutput("x", { kind: "manifest" }, {})).toBe("x")
  })

  it("manifest: returns the document from layers, content or destination.content", () => {
    const doc = { document: { width: 1 }, layers: [{ id: 1 }] }
    expect(shapeAdobeOutput({ outputs: [doc] }, { kind: "manifest" }, {})).toEqual(doc)
    expect(shapeAdobeOutput({ outputs: [{ content: doc }] }, { kind: "manifest" }, {})).toEqual(doc)
    expect(shapeAdobeOutput({ outputs: [{ destination: { content: doc } }] }, { kind: "manifest" }, {})).toEqual(doc)
  })

  it("manifest: leaves unexpected envelopes alone", () => {
    for (const raw of [{}, { outputs: [] }, { outputs: ["x"] }, { outputs: [{ status: "ok" }] }]) {
      expect(shapeAdobeOutput(raw, { kind: "manifest" }, {})).toEqual(raw)
    }
  })

  it("image job: empty without outputs, skips bad entries, keeps asset media types, size and contentClass", () => {
    expect(shapeAdobeOutput({}, imageJob, {})).toEqual({ images: [] })
    const shaped = shapeAdobeOutput(
      {
        outputs: [
          "bad",
          { seed: 1 },
          { seed: 2, image: { url: "https://cdn.test/x", mediaType: "image/webp" } },
          { url: "https://cdn.test/flat.png" },
        ],
        size: { width: 2, height: 3 },
        contentClass: "art",
      },
      imageJob,
      {},
    )
    expect(shaped).toEqual({
      images: [
        { kind: "url", url: "https://cdn.test/x", mediaType: "image/webp" },
        { kind: "url", url: "https://cdn.test/flat.png", mediaType: "image/png" },
      ],
      seeds: [1, 2],
      size: { width: 2, height: 3 },
      contentClass: "art",
    })
  })

  it("video job: reads video URLs and defaults to mp4", () => {
    expect(shapeAdobeOutput({ outputs: [{ video: { url: "https://cdn.test/v" } }] }, videoJob, {})).toEqual({
      videos: [{ kind: "url", url: "https://cdn.test/v", mediaType: "video/mp4" }],
    })
  })

  it("upscaler: presignedUrl, a nested url, a response media type, or nothing", () => {
    expect(shapeAdobeOutput({ presignedUrl: "https://cdn.test/u.webp" }, { kind: "upscaler" }, {})).toEqual({
      images: [{ kind: "url", url: "https://cdn.test/u.webp", mediaType: "image/webp" }],
    })
    expect(
      shapeAdobeOutput({ image: { url: "https://cdn.test/u" }, mediaType: "image/jpeg" }, { kind: "upscaler" }, {}),
    ).toEqual({ images: [{ kind: "url", url: "https://cdn.test/u", mediaType: "image/jpeg" }] })
    expect(shapeAdobeOutput({ status: "done" }, { kind: "upscaler" }, {})).toEqual({ images: [] })
  })

  it("photoshop multi: pairs by index with body outputs, numbers repeats, skips entries without URLs", () => {
    const shaped = shapeAdobeOutput(
      {
        outputs: [
          { destination: { url: "https://cdn.test/1" } },
          "bad",
          { url: "https://cdn.test/3" },
          { destination: { url: "https://cdn.test/4", mediaType: "image/vnd.adobe.photoshop" } },
          { status: "failed" },
        ],
      },
      { kind: "photoshop-multi" },
      {
        body: {
          outputs: [{ destination: { mediaType: "image/png" } }, {}, { mediaType: "image/png" }, "bad"],
        },
      },
    )
    expect(shaped).toEqual({
      png: { kind: "url", url: "https://cdn.test/1", mediaType: "image/png" },
      png2: { kind: "url", url: "https://cdn.test/3", mediaType: "image/png" },
      psd: { kind: "url", url: "https://cdn.test/4", mediaType: "image/vnd.adobe.photoshop" },
    })
    expect(shapeAdobeOutput({ status: "x" }, { kind: "photoshop-multi" }, {})).toEqual({})
  })

  it("url blob: wraps http strings, nested urls and presignedUrl; keeps everything else", () => {
    expect(
      shapeAdobeOutput(
        {
          rendition: "https://cdn.test/r.png",
          nested: { url: "https://cdn.test/n.pdf" },
          presignedUrl: "https://cdn.test/p.mp3",
          id: "abc",
        },
        { kind: "url-blob" },
        {},
      ),
    ).toEqual({
      rendition: { kind: "url", url: "https://cdn.test/r.png", mediaType: "image/png" },
      nested: { kind: "url", url: "https://cdn.test/n.pdf", mediaType: "application/pdf" },
      presignedUrl: { kind: "url", url: "https://cdn.test/p.mp3", mediaType: "audio/mpeg" },
      id: "abc",
    })
  })
})

describe("expandFileRefInputs edge cases", () => {
  it("leaves absent fields and plain envelopes alone, keeps url refs with headers", () => {
    const envelope = { source: { url: "https://store.test/in.psd" } }
    expect(expandFileRefInputs({ image: envelope }, ["image", "mask"])).toEqual({ image: envelope })
    expect(
      expandFileRefInputs({ image: { kind: "url", url: "https://store.test/a.png", headers: { a: "b" } } }, ["image"]),
    ).toEqual({ image: { source: { url: "https://store.test/a.png" } } })
  })

  it("rejects artifact refs and url refs without a url", () => {
    expect(() => expandFileRefInputs({ image: { kind: "artifact", uri: "ecp://runs/r/artifacts/a" } }, ["image"])).toThrow(
      AdobeServiceError,
    )
    expect(() => expandFileRefInputs({ image: { kind: "url" } }, ["image"])).toThrow(/url FileRefs only/)
  })
})
