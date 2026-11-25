import { describe, expect, it } from "vitest"
import { captureSourceFromRef, isFileRefValue, walkFileRefs } from "../src/file-ref-shape.js"

describe("file-ref-shape", () => {
  it("detects file refs by shape", () => {
    expect(isFileRefValue({ kind: "url", url: "https://example.test/a" })).toBe(true)
    expect(isFileRefValue({ kind: "file", path: "/tmp/x" })).toBe(true)
    expect(isFileRefValue({ url: "https://example.test" })).toBe(false)
  })

  it("walks nested refs", () => {
    const paths: string[] = []
    walkFileRefs({ items: [{ kind: "url", url: "https://example.test" }] }, (_ref, pointer) => {
      paths.push(pointer)
    })
    expect(paths).toEqual(["items/0"])
  })

  it("strips query strings from captured url sources", () => {
    const source = captureSourceFromRef({ kind: "url", url: "https://example.test/a?sig=secret" })
    expect(source.url).toBe("https://example.test/a")
  })

  it("snapshots file and artifact sources", () => {
    expect(captureSourceFromRef({ kind: "file", path: "/tmp/a.png" })).toEqual({
      kind: "file",
      path: "/tmp/a.png",
    })
    expect(captureSourceFromRef({ kind: "artifact", uri: "ecp://runs/r/artifacts/a.png" })).toEqual({
      kind: "artifact",
      uri: "ecp://runs/r/artifacts/a.png",
    })
  })

  it("rejects non-file-ref shapes", () => {
    expect(isFileRefValue({ kind: "artifact" })).toBe(false)
    expect(isFileRefValue(null)).toBe(false)
  })

  it("walks object properties at the document root", () => {
    const refs: string[] = []
    walkFileRefs(
      { a: { kind: "file", path: "/x" }, b: { kind: "url", url: "https://example.test" } },
      (_ref, pointer) => refs.push(pointer),
    )
    expect(refs.sort()).toEqual(["a", "b"])
  })

  it("keeps unparseable urls in capture sources", () => {
    expect(captureSourceFromRef({ kind: "url", url: "not-a-url?x=1" }).url).toBe("not-a-url")
  })

  it("ignores unknown kinds and empty values", () => {
    expect(isFileRefValue({ kind: "other", url: "x" })).toBe(false)
    expect(isFileRefValue({ kind: "file", path: "" })).toBe(false)
    walkFileRefs(null, () => {
      throw new Error("should not visit")
    })
  })
})