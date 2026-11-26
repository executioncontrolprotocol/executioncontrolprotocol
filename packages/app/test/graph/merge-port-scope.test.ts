import { describe, expect, it } from "vitest"
import { analyseMergePort, type ScopeSegment } from "../../src/graph/merge-port-scope.js"

function ifSide(id: string, side: "then" | "else"): ScopeSegment[] {
  return [{ kind: "if", id, side }]
}

function parallel(index: number): ScopeSegment[] {
  return [{ kind: "parallel", id: "p", index }]
}

describe("analyseMergePort", () => {
  it("accepts opposite if sides", () => {
    expect(analyseMergePort([ifSide("g", "then"), ifSide("g", "else")])).toEqual({ valid: true, definite: true })
  })

  it("rejects same if side", () => {
    expect(analyseMergePort([ifSide("g", "then"), ifSide("g", "then")])).toEqual({ valid: false, definite: false })
  })

  it("rejects parallel paths", () => {
    expect(analyseMergePort([parallel(0), parallel(1)])).toEqual({ valid: false, definite: false })
  })

  it("rejects a single scope", () => {
    expect(analyseMergePort([ifSide("g", "then")])).toEqual({ valid: false, definite: false })
  })

  it("accepts nested opposite sides with definite coverage", () => {
    const outerThen: ScopeSegment[] = [
      { kind: "if", id: "outer", side: "then" },
      { kind: "if", id: "inner", side: "then" },
    ]
    const outerElse: ScopeSegment[] = [
      { kind: "if", id: "outer", side: "else" },
      { kind: "if", id: "inner", side: "else" },
    ]
    expect(analyseMergePort([outerThen, outerElse])).toMatchObject({ valid: true })
  })

  it("is valid but indefinite when only one outer branch is present", () => {
    const thenPath: ScopeSegment[] = [
      { kind: "if", id: "g", side: "then" },
      { kind: "if", id: "inner", side: "then" },
    ]
    const elsePath: ScopeSegment[] = [{ kind: "if", id: "g", side: "else" }]
    expect(analyseMergePort([thenPath, elsePath])).toEqual({ valid: true, definite: false })
  })

  it("rejects unrelated scopes with no shared separator", () => {
    const a: ScopeSegment[] = [{ kind: "if", id: "a", side: "then" }]
    const b: ScopeSegment[] = [{ kind: "if", id: "b", side: "else" }]
    expect(analyseMergePort([a, b])).toEqual({ valid: false, definite: false })
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