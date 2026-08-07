import { describe, expect, it } from "vitest"
import { collectImageRefs, isImageRef } from "../src/image/image-ref.js"

describe("image-ref helpers", () => {
  it("isImageRef recognizes portable refs", () => {
    expect(isImageRef({ kind: "file", path: "/x.png" })).toBe(true)
    expect(isImageRef({ kind: "url", url: "https://a.com/b.png" })).toBe(true)
    expect(isImageRef({ foo: "bar" })).toBe(false)
  })

  it("collectImageRefs walks nested structures", () => {
    const refs = collectImageRefs({
      image: { kind: "file", path: "/a.png" },
      overlays: [{ image: { kind: "artifact", uri: "ecp://x" } }],
    })
    expect(refs).toHaveLength(2)
    expect(refs[0]?.path).toBe("image")
    expect(refs[1]?.path).toBe("overlays[0].image")
  })
})
