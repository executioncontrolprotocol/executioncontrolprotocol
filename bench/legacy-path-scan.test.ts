import { describe, expect, it } from "vitest"
import { findLegacyPathRefs } from "./legacy-path-scan.mjs"

describe("legacy-path-scan", () => {
  it("fails on legacy path imports", () => {
    const legacyImportPath = ["..", "legacy", "foo"].join("/")
    const importLine = `import x from ${JSON.stringify(legacyImportPath)}`
    expect(
      findLegacyPathRefs("/", {
        "packages/foo.ts": importLine,
      }),
    ).toEqual(["packages/foo.ts"])
  })

  it("allows prose legacy without slash", () => {
    expect(
      findLegacyPathRefs("/", {
        "plugins/firefly.ts": "// legacy v1 API",
      }),
    ).toEqual([])
  })

  it("ignores realignment markdown", () => {
    expect(
      findLegacyPathRefs("/", {
        "realignment/spec/foo.md": "see legacy/ tree",
      }),
    ).toEqual([])
  })
})