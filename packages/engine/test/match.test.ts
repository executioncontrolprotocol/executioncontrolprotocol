import { describe, expect, it } from "vitest"
import { matchCandidates, tokensOf } from "../src/operations/match.js"

const candidates = [
  { id: "@executioncontrolprotocol/test.echo", summary: "Echo a value", description: "Return the input unchanged" },
  { id: "@executioncontrolprotocol/test.delay", summary: "Wait", description: "Delay for a number of milliseconds" },
  { id: "@executioncontrolprotocol/anthropic.generate", summary: "Generate text", description: "Write a headline" },
]

describe("retrieve matching", () => {
  it("scores id matches above summary matches and breaks ties by id", () => {
    expect(tokensOf("a echo!")).toEqual(["echo"])
    const hits = matchCandidates("echo", candidates)
    expect(hits[0]).toEqual({ id: "@executioncontrolprotocol/test.echo", score: 11 })
    expect(hits.find((hit) => hit.id.endsWith("delay"))).toBeUndefined()
  })

  it("drops zero scores, requires every token for the bonus, and honours limit", () => {
    expect(matchCandidates("zz", candidates)).toEqual([])
    expect(matchCandidates("a", candidates)).toEqual([])
    const both = matchCandidates("echo value", candidates)
    expect(both[0]?.id).toContain("echo")
    expect(both[0]?.score).toBeGreaterThan(8)
    const described = matchCandidates("headline", [
      { id: "b" },
      { id: "a", description: "a headline" },
      { id: "a", description: "a headline" },
    ])
    expect(described[0]?.id).toBe("a")
    const limited = matchCandidates("test", candidates, 1)
    expect(limited).toHaveLength(1)
    expect(limited[0]?.id).toBe("@executioncontrolprotocol/test.delay")
  })
})
