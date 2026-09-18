import { describe, expect, it } from "vitest"
import {
  flattenProviderChatTurns,
  toProviderChatTurns,
} from "../../src/harness/authoring/to-provider-chat-turns.js"

describe("toProviderChatTurns", () => {
  it("builds system + prior messages + current prompt", () => {
    expect(
      toProviderChatTurns({
        system: "Be brief",
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
        prompt: "continue",
      })
    ).toEqual([
      { role: "system", content: "Be brief" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "continue" },
    ])
  })

  it("omits empty prior messages and keeps single-shot when messages omitted", () => {
    expect(toProviderChatTurns({ prompt: "only" })).toEqual([
      { role: "user", content: "only" },
    ])
    expect(
      toProviderChatTurns({
        prompt: "now",
        messages: [{ role: "user", content: "   " }],
      })
    ).toEqual([{ role: "user", content: "now" }])
  })

  it("flattens turns for providers without native message lists", () => {
    const text = flattenProviderChatTurns({
      system: "sys",
      messages: [{ role: "assistant", content: "prior" }],
      prompt: "fix it",
    })
    expect(text).toContain("System: sys")
    expect(text).toContain("Assistant: prior")
    expect(text).toContain("User: fix it")
  })
})
