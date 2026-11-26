import { describe, expect, it } from "vitest"
import { analyseMergePort, type ScopeSegment } from "../src/validate/merge-port-scope.js"

const ifSide = (id: string, side: "then" | "else"): ScopeSegment => ({ kind: "if", id, side })

describe("analyseMergePort", () => {
  it("marks opposite sides as valid and definite", () => {
    expect(analyseMergePort([[ifSide("g", "then")], [ifSide("g", "else")]])).toEqual({ valid: true, definite: true })
  })

  it("marks same-side refs as ambiguous", () => {
    expect(analyseMergePort([[ifSide("g", "then")], [ifSide("g", "then")]])).toEqual({ valid: false, definite: false })
  })

  it("rejects refs from different parallel paths", () => {
    const parallel = (index: number): ScopeSegment[] => [{ kind: "parallel", id: "p", index }]
    expect(analyseMergePort([parallel(0), parallel(1)])).toEqual({ valid: false, definite: false })
  })

  it("is valid but not definite when a separator side lacks coverage", () => {
    expect(
      analyseMergePort([
        [ifSide("o", "then")],
        [ifSide("o", "else"), ifSide("inner", "then")],
      ]),
    ).toEqual({ valid: true, definite: false })
  })

  it("rejects a single scope", () => {
    expect(analyseMergePort([[ifSide("g", "then")]])).toEqual({ valid: false, definite: false })
  })

  it("rejects unrelated scopes with no shared separator", () => {
    expect(analyseMergePort([[ifSide("a", "then")], [ifSide("b", "else")]])).toEqual({ valid: false, definite: false })
  })

  it("covers nested inner if branches for definite merge", () => {
    const left: ScopeSegment[] = [
      { kind: "if", id: "outer", side: "then" },
      { kind: "if", id: "inner", side: "then" },
    ]
    const rightThen: ScopeSegment[] = [
      { kind: "if", id: "outer", side: "then" },
      { kind: "if", id: "inner", side: "else" },
    ]
    const rightElse: ScopeSegment[] = [{ kind: "if", id: "outer", side: "else" }]
    expect(analyseMergePort([left, rightThen, rightElse])).toMatchObject({ valid: true, definite: true })
  })
})