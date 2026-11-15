import { describe, expect, it } from "vitest"
import plugin from "../src/index.js"

describe("plugin-test", () => {
  it("exports the test plugin definition", () => {
    expect(plugin.id).toBe("@executioncontrolprotocol/test")
  })
})
