import { describe, expect, it, beforeEach, vi } from "vitest"
import { clampSplitWidth, readStoredSplitWidth, storeSplitWidth, SPLIT_STORAGE_KEY } from "../src/lib/split-pane.js"

describe("split-pane", () => {
  it("clamps width between min and max ratio", () => {
    expect(clampSplitWidth(100, 1000, 280, 0.55)).toBe(280)
    expect(clampSplitWidth(800, 1000, 280, 0.55)).toBe(550)
    expect(clampSplitWidth(400, 1000, 280, 0.55)).toBe(400)
  })
})

describe("split-pane storage", () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })
  })

  it("round-trips stored width in localStorage", () => {
    storeSplitWidth(420)
    expect(localStorage.getItem(SPLIT_STORAGE_KEY)).toBe("420")
    expect(readStoredSplitWidth()).toBe(420)
  })
})
