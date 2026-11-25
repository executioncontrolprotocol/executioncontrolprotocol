import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import { VERSION } from "../src/index.js"

const pkgVersion = (createRequire(import.meta.url)("../package.json") as { version: string }).version

describe("mcp-relay", () => {
  it("exports its package.json version", () => {
    expect(VERSION).toBe(pkgVersion)
  })
})
