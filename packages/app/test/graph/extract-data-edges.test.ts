import type { Node } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  extractDataEdges,
  formatExprBadge,
  longestMatchingPortId,
  parseStateRef,
  resolveInputHandle,
  stateKeyFromExpr,
  stateReadsFromExpr,
  walkInputExprs,
  walkInputRefs,
} from "../../src/graph/index.js"

describe("parseStateRef", () => {
  it("splits key and field path, with or without the state prefix", () => {
    expect(parseStateRef("state.doc.echo.title")).toEqual({ asKey: "doc", fieldPath: "echo.title" })
    expect(parseStateRef("history")).toEqual({ asKey: "history", fieldPath: "" })
  })

  it("rejects an empty key", () => {
    expect(parseStateRef("state.")).toBeUndefined()
    expect(parseStateRef("")).toBeUndefined()
  })
})

describe("longestMatchingPortId / resolveInputHandle", () => {
  it("picks the longest dotted prefix", () => {
    expect(longestMatchingPortId("a.b.c", ["a", "a.b", "x"])).toBe("a.b")
    expect(resolveInputHandle("v.k.z", ["v", "v.k"])).toBe("v.k")
  })

  it("falls back to the first segment, output, or the full input path", () => {
    expect(longestMatchingPortId("a.b", ["", "z"])).toBe("a")
    expect(longestMatchingPortId("")).toBe("output")
    expect(resolveInputHandle("v.k")).toBe("v.k")
    expect(resolveInputHandle("")).toBe("")
  })
})

describe("formatExprBadge", () => {
  it("drops a concise arrow head and collapses whitespace", () => {
    expect(formatExprBadge("(state) =>\n   state.a  === 1")).toBe("state.a === 1")
    expect(formatExprBadge("s => s.ok")).toBe("s.ok")
    expect(formatExprBadge("async (state) => state.x")).toBe("state.x")
    expect(formatExprBadge("() => true")).toBe("true")
  })

  it("keeps block bodies and non-arrow sources whole", () => {
    expect(formatExprBadge("(state) => { return state.a }")).toBe("(state) => { return state.a }")
    expect(formatExprBadge("function (s) { return s.a }")).toBe("function (s) { return s.a }")
  })

  it("returns an empty string without an expression", () => {
    expect(formatExprBadge()).toBe("")
    expect(formatExprBadge("")).toBe("")
  })
})

describe("stateReadsFromExpr", () => {
  it("reads dotted, optional-chained and bracket paths on the parameter", () => {
    expect(stateReadsFromExpr("(state) => state.doc.echo.title && state?.flag")).toEqual(["doc.echo.title", "flag"])
    expect(stateReadsFromExpr(`(s) => s["my key"].x + s['b']`)).toEqual(["my key.x", "b"])
    expect(stateReadsFromExpr("function (st) { return st.a > 1 }")).toEqual(["a"])
    expect(stateReadsFromExpr("async (state) => state.a")).toEqual(["a"])
  })

  it("dedupes and ignores other identifiers", () => {
    expect(stateReadsFromExpr("(state) => state.a + state.a + other.state.b + mystate.c")).toEqual(["a"])
  })

  it("returns nothing without a parameter", () => {
    expect(stateReadsFromExpr("() => 1")).toEqual([])
    expect(stateReadsFromExpr("1 + 1")).toEqual([])
    expect(stateKeyFromExpr("() => 1")).toBeUndefined()
    expect(stateKeyFromExpr("(state) => state.on === true")).toBe("on")
  })
})

describe("walkers", () => {
  const value = {
    a: { $ref: "state.x" },
    b: [{ $state: "y" }, 2],
    c: { $expr: "(state) => state.z" },
    d: { $script: { lang: "js", source: "1", params: { p: { $ref: "state.w" }, q: { $expr: "(s) => s.v" }, r: 3 } } },
    $skip: { $ref: "state.never" },
  }

  it("walkInputRefs visits $ref, $state and script params", () => {
    const seen: Array<[string, string, string | undefined]> = []
    walkInputRefs(value, "root", (p, r, k) => seen.push([p, r, k]))
    expect(seen).toEqual([
      ["root.a", "state.x", undefined],
      ["root.d", "state.w", "p"],
    ])
  })

  it("walkInputExprs visits $expr values and script params", () => {
    const seen: Array<[string, string]> = []
    walkInputExprs(value, "", (p, s) => seen.push([p, s]))
    expect(seen).toEqual([
      ["c", "(state) => state.z"],
      ["d", "(s) => s.v"],
    ])
  })

  it("ignores primitives and scripts without params", () => {
    const seen: string[] = []
    walkInputRefs("text", "x", (p) => seen.push(p))
    walkInputRefs({ $script: { lang: "js", path: "a.js" } }, "x", (p) => seen.push(p))
    walkInputExprs({ $script: { lang: "js", path: "a.js" } }, "x", (p) => seen.push(p))
    walkInputExprs(null, "x", (p) => seen.push(p))
    expect(seen).toEqual([])
  })
})

describe("extractDataEdges", () => {
  const nodes: Node[] = [
    { id: "w1", uses: "@x/p.c", input: { v: 1 }, as: "k" },
    { id: "r1", uses: "@x/p.c", input: { v: { $ref: "state.k" } } },
    { id: "w2", uses: "@x/p.c", input: { v: 2 }, as: "k" },
    { id: "r2", uses: "@x/p.c", input: { v: { $ref: "state.k.f" } } },
    {
      type: "loop",
      id: "l",
      mode: "for",
      as: "i",
      input: { count: 2 },
      steps: [{ id: "self", uses: "@x/p.c", input: { v: { $ref: "state.later" } }, as: "later", mode: "replace" }],
    },
  ]

  it("resolves the last earlier writer of a key", () => {
    const edges = extractDataEdges(nodes, new Set(["inp"]))
    expect(edges.map((e) => [e.source, e.target, e.sourceHandle])).toEqual([
      ["w1", "r1", "output"],
      ["w2", "r2", "f"],
    ])
  })

  it("loop item reads inside forEach resolve to the loop head item handle", () => {
    const nodes: Node[] = [
      {
        type: "loop",
        mode: "forEach",
        id: "items",
        as: "row",
        input: { items: { $ref: "state.list" } },
        steps: [
          {
            id: "body",
            uses: "@x/p.c",
            input: { a: { $ref: "state.row" }, b: { $ref: "state.rowIndex" } },
          },
        ],
      },
    ]
    const edges = extractDataEdges(nodes)
    expect(edges).toContainEqual(
      expect.objectContaining({ source: "items", target: "body", sourceHandle: "item", targetHandle: "a" }),
    )
    expect(edges).toContainEqual(
      expect.objectContaining({ source: "items", target: "body", sourceHandle: "index", targetHandle: "b" }),
    )
  })

  it("if as inside then reads from the then port", () => {
    const nodes: Node[] = [
      {
        type: "if",
        id: "tier",
        as: "customer",
        input: { tier: { $ref: "state.base" } },
        expression: "true",
        then: [
          {
            id: "reader",
            uses: "@x/p.c",
            input: { v: { $ref: "state.customer.tier" } },
          },
        ],
      },
    ]
    const edges = extractDataEdges(nodes)
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: "tier",
        sourceHandle: "then",
        target: "reader",
        targetHandle: "v",
      }),
    )
  })

  it("a reader with no earlier writer uses a later writer, never itself", () => {
    const loopCarried: Node[] = [
      { id: "reader", uses: "@x/p.c", input: { v: { $ref: "state.acc" } } },
      { id: "writer", uses: "@x/p.c", input: {}, as: "acc" },
    ]
    expect(extractDataEdges(loopCarried).map((e) => [e.source, e.target])).toEqual([["writer", "reader"]])
    expect(extractDataEdges(nodes).some((e) => e.source === "self")).toBe(false)
  })
})
