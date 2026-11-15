import { describe, expect, it } from "vitest"
import { QuickJsExpressionEngine } from "../src/index.js"

describe("quickjs", () => {
  it("exports the expression engine id", () => {
    expect(QuickJsExpressionEngine.id).toBe("@executioncontrolprotocol/quickjs")
  })
})
