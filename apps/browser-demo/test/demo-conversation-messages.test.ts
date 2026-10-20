import { describe, expect, it } from "vitest"
import {
  buildDemoConversationMessages,
  DEMO_CHAT_HISTORY_MAX_CHARS,
  truncateConversationContent,
} from "../src/lib/demo-conversation-messages.js"

describe("buildDemoConversationMessages", () => {
  it("maps user and agent turns and skips empty/error", () => {
    expect(
      buildDemoConversationMessages([
        { id: "1", role: "agent", text: "Welcome" },
        { id: "2", role: "user", text: "Create a workflow" },
        { id: "3", role: "agent", text: "Done" },
        { id: "4", role: "agent", text: "boom", variant: "error" },
        { id: "5", role: "user", text: "  " },
      ])
    ).toEqual([
      { role: "assistant", content: "Welcome" },
      { role: "user", content: "Create a workflow" },
      { role: "assistant", content: "Done" },
    ])
  })

  it("keeps only the last N turns", () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      role: (i % 2 === 0 ? "user" : "agent") as "user" | "agent",
      text: `t${i}`,
    }))
    const turns = buildDemoConversationMessages(messages, 4)
    expect(turns).toHaveLength(4)
    expect(turns[0]?.content).toBe("t16")
  })

  it("truncates oversized assistant turns for model context", () => {
    const huge = "x".repeat(DEMO_CHAT_HISTORY_MAX_CHARS + 200)
    const turns = buildDemoConversationMessages([
      { id: "1", role: "agent", text: huge },
    ])
    expect(turns[0]?.content.length).toBeLessThanOrEqual(DEMO_CHAT_HISTORY_MAX_CHARS)
    expect(turns[0]?.content).toContain("truncated for model context")
    expect(truncateConversationContent("short")).toBe("short")
  })
})
