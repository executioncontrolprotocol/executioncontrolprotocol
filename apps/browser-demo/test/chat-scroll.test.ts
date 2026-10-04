import { describe, expect, it } from "vitest"
import { CHAT_STICK_BOTTOM_THRESHOLD_PX, isChatNearBottom } from "../src/lib/chat-scroll.js"

describe("isChatNearBottom", () => {
  it("is true when scrolled to the bottom", () => {
    expect(isChatNearBottom(400, 200, 600)).toBe(true)
  })

  it("is false when the user scrolled up past the threshold", () => {
    expect(isChatNearBottom(0, 200, 600)).toBe(false)
    expect(
      isChatNearBottom(400 - CHAT_STICK_BOTTOM_THRESHOLD_PX - 1, 200, 600)
    ).toBe(false)
  })

  it("is true at the threshold edge", () => {
    expect(
      isChatNearBottom(400 - CHAT_STICK_BOTTOM_THRESHOLD_PX, 200, 600)
    ).toBe(true)
  })
})
