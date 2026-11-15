import { describe, expect, it } from "vitest"
import { VERSION } from "../src/index.js"

describe("@executioncontrolprotocol/plugin-sdk", () => {
  it("exports VERSION", () => {
    expect(VERSION).toBe("2.0.0")
  })
})
