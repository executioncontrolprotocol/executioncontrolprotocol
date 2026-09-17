import { describe, expect, it } from "vitest"
import {
  buildCodingRepairGenerateMessages,
  normalizeCodingConversationMessages,
  previousUserMessageFromConversation,
} from "../src/conversation-messages.js"

describe("coding conversation messages", () => {
  it("normalizes and drops empty turns", () => {
    expect(
      normalizeCodingConversationMessages([
        { role: "user", content: " hi " },
        { role: "assistant", content: "  " },
        { role: "assistant", content: "ok" },
      ])
    ).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "ok" },
    ])
  })

  it("builds repair generate messages with prior raw as assistant turn", () => {
    expect(
      buildCodingRepairGenerateMessages({
        conversationMessages: [{ role: "user", content: "earlier" }],
        originalUserPrompt: "User request: create",
        priorRaw: "export default workflow(\"x\")",
      })
    ).toEqual([
      { role: "user", content: "earlier" },
      { role: "user", content: "User request: create" },
      { role: "assistant", content: "export default workflow(\"x\")" },
    ])
  })

  it("finds the previous user message for thin intent routing", () => {
    expect(
      previousUserMessageFromConversation([
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "second" },
        { role: "assistant", content: "ok" },
      ])
    ).toBe("second")
    expect(previousUserMessageFromConversation(undefined)).toBeUndefined()
  })
})
