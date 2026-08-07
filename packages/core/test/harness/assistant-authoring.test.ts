import { describe, expect, it } from "vitest"
import { isEnvironmentQuestion } from "../../src/harness/authoring/environment-question.js"
import {
  answerRedirectsToHarnessScope,
  buildAssistantSafeReply,
  HARNESS_ASSISTANT_OUT_OF_SCOPE_ANSWER,
  HARNESS_ASSISTANT_SAFE_REPLY_MESSAGE,
  HARNESS_ASSISTANT_SCOPE_REDIRECT_PHRASE,
} from "../../src/harness/authoring/safe-reply.js"

describe("isEnvironmentQuestion", () => {
  it("detects capability and identity questions", () => {
    expect(isEnvironmentQuestion("What can you do?")).toBe(true)
    expect(isEnvironmentQuestion("What extensions are available?")).toBe(true)
    expect(isEnvironmentQuestion("List supported capabilities")).toBe(true)
  })

  it("returns false for workflow requests", () => {
    expect(isEnvironmentQuestion("Create a new echo workflow")).toBe(false)
  })
})

describe("buildAssistantSafeReply", () => {
  it("returns a valid harness reply document", () => {
    const reply = buildAssistantSafeReply()
    expect(reply.schema).toBe("@executioncontrolprotocol.harness.reply")
    expect(reply.answer.length).toBeGreaterThan(10)
  })

  it("includes the shared scope redirect phrase", () => {
    expect(HARNESS_ASSISTANT_SAFE_REPLY_MESSAGE).toContain(
      HARNESS_ASSISTANT_SCOPE_REDIRECT_PHRASE
    )
    expect(HARNESS_ASSISTANT_OUT_OF_SCOPE_ANSWER).toContain(
      HARNESS_ASSISTANT_SCOPE_REDIRECT_PHRASE
    )
    expect(buildAssistantSafeReply().answer).toContain(HARNESS_ASSISTANT_SCOPE_REDIRECT_PHRASE)
  })
})

describe("answerRedirectsToHarnessScope", () => {
  it("matches redirect answers", () => {
    expect(answerRedirectsToHarnessScope(HARNESS_ASSISTANT_OUT_OF_SCOPE_ANSWER)).toBe(true)
    expect(answerRedirectsToHarnessScope("Ask about workflows or capabilities.")).toBe(true)
    expect(answerRedirectsToHarnessScope("That is outside my scope.")).toBe(true)
  })

  it("rejects unrelated answers", () => {
    expect(answerRedirectsToHarnessScope("Sure, here is a joke for you.")).toBe(false)
  })
})
