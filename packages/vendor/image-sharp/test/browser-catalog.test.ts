import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { resolveCapabilityExecution } from "@executioncontrolprotocol/core"
import { imageSharpExtension } from "../src/index.browser.js"

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("image-sharp browser catalog", () => {
  it("does not import sharp or node:fs in the browser entry source", () => {
    const src = readFileSync(join(pkgRoot, "src/index.browser.ts"), "utf8")
    expect(src).not.toMatch(/from ["']sharp["']/)
    expect(src).not.toMatch(/import\(["']sharp["']\)/)
    expect(src).not.toMatch(/from ["']node:fs["']/)
    const dist = readFileSync(join(pkgRoot, "dist/index.browser.js"), "utf8")
    expect(dist).not.toMatch(/from ["']sharp["']/)
    expect(dist).not.toMatch(/from ["']node:fs["']/)
  })

  it("catalogs host execution for all capabilities", () => {
    expect(imageSharpExtension.supportedRuntimes).toEqual(["@executioncontrolprotocol/node"])
    expect(
      imageSharpExtension.capabilities.every(
        (cap) => resolveCapabilityExecution(cap, imageSharpExtension) === "host",
      ),
    ).toBe(true)
  })
})
