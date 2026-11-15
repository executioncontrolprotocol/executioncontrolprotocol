import { describe, expect, it } from "vitest"
import {
  fragmentWithoutToken,
  parseLaunchFragment,
  resolveLaunch,
  TOKEN_STORAGE_KEY,
  type TokenStorage,
} from "../../src/client/launch.js"

function memoryStorage(initial: Record<string, string> = {}): TokenStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

describe("parseLaunchFragment", () => {
  it("reads token, open, id and dir, with or without the leading #", () => {
    const open = "C:\\work\\a b.ecp.json"
    const hash = `#token=t1&open=${encodeURIComponent(open)}&id=my-exec&dir=%2Ftmp`
    expect(parseLaunchFragment(hash)).toEqual({ token: "t1", open, id: "my-exec", dir: "/tmp" })
    expect(parseLaunchFragment("token=t2")).toEqual({ token: "t2" })
  })

  it("drops empty and unknown parameters", () => {
    expect(parseLaunchFragment("#token=&open=&other=1")).toEqual({})
    expect(parseLaunchFragment("")).toEqual({})
  })
})

describe("resolveLaunch", () => {
  it("stores a fragment token", () => {
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: "old" })
    expect(resolveLaunch("#token=new&open=%2Fa.ecp.json", storage)).toEqual({ token: "new", open: "/a.ecp.json" })
    expect(storage.data[TOKEN_STORAGE_KEY]).toBe("new")
  })

  it("falls back to the stored token", () => {
    expect(resolveLaunch("#dir=%2Fw", memoryStorage({ [TOKEN_STORAGE_KEY]: "kept" }))).toEqual({ dir: "/w", token: "kept" })
  })

  it("has no token when neither has one", () => {
    expect(resolveLaunch("", memoryStorage())).toEqual({})
  })
})

describe("fragmentWithoutToken", () => {
  it("keeps the other parameters and drops the token", () => {
    expect(fragmentWithoutToken({ token: "t", open: "/a b", dir: "/d" })).toBe("#open=%2Fa+b&dir=%2Fd")
  })

  it("is empty when only the token was present", () => {
    expect(fragmentWithoutToken({ token: "t" })).toBe("")
    expect(fragmentWithoutToken({})).toBe("")
  })
})
