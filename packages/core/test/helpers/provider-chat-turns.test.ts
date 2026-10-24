import { describe, expect, it } from "vitest"
import { flattenProviderChatTurns, toProviderChatTurns } from "../../src/helpers/provider-chat-turns.js"

describe("toProviderChatTurns", () => {
  it("emits a single user turn from prompt", () => {
    expect(toProviderChatTurns({ prompt: "hello" })).toEqual([{ role: "user", content: "hello" }])
  })

  it("puts system first when present", () => {
    expect(toProviderChatTurns({ prompt: "hello", system: "be brief" })).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hello" },
    ])
  })

  it("inserts prior messages between system and the final prompt", () => {
    expect(
      toProviderChatTurns({
        prompt: "fix it",
        system: "be brief",
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
      })
    ).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "fix it" },
    ])
  })

  it("skips blank prior messages", () => {
    expect(
      toProviderChatTurns({
        prompt: "go",
        messages: [
          { role: "user", content: "   " },
          { role: "assistant", content: "ok" },
        ],
      })
    ).toEqual([
      { role: "assistant", content: "ok" },
      { role: "user", content: "go" },
    ])
  })

  it("stringifies object context as an extra system turn", () => {
    expect(toProviderChatTurns({ prompt: "go", context: { prior: 1 } })).toEqual([
      { role: "system", content: '{"prior":1}' },
      { role: "user", content: "go" },
    ])
  })

  it("keeps string context as-is", () => {
    expect(toProviderChatTurns({ prompt: "go", context: "notes" })).toEqual([
      { role: "system", content: "notes" },
      { role: "user", content: "go" },
    ])
  })
})

describe("flattenProviderChatTurns", () => {
  it("labels roles for providers without native turns", () => {
    expect(
      flattenProviderChatTurns({
        prompt: "fix it",
        system: "be brief",
        messages: [{ role: "assistant", content: "hello" }],
      })
    ).toBe("System: be brief\n\nAssistant: hello\n\nUser: fix it")
  })

  it("returns only the user line when there is no system or history", () => {
    expect(flattenProviderChatTurns({ prompt: "hello" })).toBe("User: hello")
  })
})
