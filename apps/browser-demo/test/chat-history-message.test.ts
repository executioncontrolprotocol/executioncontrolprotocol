import { describe, expect, it } from "vitest"
import { buildAgentChatMessage } from "../src/hooks/useChatHistory.js"

describe("buildAgentChatMessage", () => {
  it("stores a frozen run output snapshot on the message", () => {
    const output = { echo: "first" }
    const msg = buildAgentChatMessage("Run succeeded", {
      runOutput: true,
      runOutputData: output,
    }, "msg-1")
    expect(msg).toMatchObject({
      id: "msg-1",
      role: "agent",
      text: "Run succeeded",
      runOutput: true,
      runOutputData: output,
    })
  })

  it("omits run fields when runOutput is false", () => {
    const msg = buildAgentChatMessage("hi", { runOutputData: { x: 1 } }, "msg-2")
    expect(msg.runOutput).toBeUndefined()
    expect(msg.runOutputData).toBeUndefined()
  })

  it("keeps independent snapshots for multiple messages", () => {
    const a = buildAgentChatMessage("a", {
      runOutput: true,
      runOutputData: { n: 1 },
    }, "a")
    const b = buildAgentChatMessage("b", {
      runOutput: true,
      runOutputData: { n: 2 },
    }, "b")
    expect(a.runOutputData).toEqual({ n: 1 })
    expect(b.runOutputData).toEqual({ n: 2 })
  })
})
