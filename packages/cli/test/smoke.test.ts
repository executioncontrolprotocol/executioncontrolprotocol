import { describe, expect, it } from "vitest"
import { VERSION } from "../src/index.js"

describe("cli", () => {
  it("exports its version", () => {
    expect(VERSION).toBe("2.0.0")
  })
})
