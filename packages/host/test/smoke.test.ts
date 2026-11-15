import { describe, expect, it } from "vitest"
import { VERSION } from "../src/index.js"

describe("host package", () => {
  it("exports a version", () => {
    expect(VERSION).toBe("2.0.0")
  })
})
