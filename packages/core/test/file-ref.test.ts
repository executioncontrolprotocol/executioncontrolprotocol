import { describe, expect, it } from "vitest"
import { collectFileRefs, isFileRef } from "../src/file/file-ref.js"

describe("file-ref helpers", () => {
  it("isFileRef recognizes portable refs", () => {
    expect(isFileRef({ kind: "file", path: "/x.png" })).toBe(true)
    expect(isFileRef({ kind: "url", url: "https://a.com/b.png" })).toBe(true)
    expect(isFileRef({ foo: "bar" })).toBe(false)
  })

  it("collectFileRefs walks nested structures", () => {
    const refs = collectFileRefs({
      image: { kind: "file", path: "/a.png" },
      overlays: [{ image: { kind: "artifact", uri: "ecp://x" } }],
    })
    expect(refs).toHaveLength(2)
    expect(refs[0]?.path).toBe("image")
    expect(refs[1]?.path).toBe("overlays[0].image")
  })
})
