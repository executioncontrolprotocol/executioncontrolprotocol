import { describe, expect, it } from "vitest"
import { checkExpression } from "../src/validate/expr.js"

describe("checkExpression", () => {
  it.each(["input.tier === 'gold'", "({ length: input.value.length })", "(input.a) + (input.b)", "  input.ok  "])(
    "accepts %s",
    (source) => {
      expect(checkExpression(source)).toBeUndefined()
    },
  )

  it.each(["input.a; input.b", "return input.a", "", "input.a ===", "{ a: 1 }; 2"])("rejects %j", (source) => {
    expect(checkExpression(source)).toMatchObject({ line: 1 })
  })

  it("points at the column of a syntax error in the source as written", () => {
    expect(checkExpression("input.a === )")).toMatchObject({ line: 1, column: 13 })
  })
})
