import { describe, expect, it } from "vitest"
import { APP_BEARER_PREFIX, APP_TOKEN_QUERY } from "@executioncontrolprotocol/app"
import { APP_TOKEN_COOKIE } from "../src/constants.js"
import { generateAppToken, tokenFromRequest, tokensEqual } from "../src/token.js"

describe("generateAppToken", () => {
  it("returns 64 hex characters", () => {
    expect(generateAppToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  it("returns a different token each call", () => {
    expect(generateAppToken()).not.toBe(generateAppToken())
  })
})

describe("tokensEqual", () => {
  it("accepts matching tokens", () => {
    expect(tokensEqual("abc", "abc")).toBe(true)
  })

  it("rejects a length mismatch without throwing", () => {
    expect(tokensEqual("ab", "abc")).toBe(false)
  })

  it("rejects a different token of the same length", () => {
    expect(tokensEqual("aaa", "bbb")).toBe(false)
  })
})

describe("tokenFromRequest", () => {
  const url = new URL("http://127.0.0.1/")

  it("reads the query parameter first", () => {
    const withQuery = new URL(`http://127.0.0.1/?${APP_TOKEN_QUERY}=from-query`)
    expect(
      tokenFromRequest(withQuery, {
        authorization: `${APP_BEARER_PREFIX}from-header`,
        cookie: `${APP_TOKEN_COOKIE}=from-cookie`,
      })
    ).toBe("from-query")
  })

  it("reads the bearer header when the query is missing", () => {
    expect(
      tokenFromRequest(url, { authorization: `${APP_BEARER_PREFIX}from-header` })
    ).toBe("from-header")
  })

  it("reads the cookie when query and bearer are missing", () => {
    expect(
      tokenFromRequest(url, { cookie: `${APP_TOKEN_COOKIE}=from-cookie; other=1` })
    ).toBe("from-cookie")
  })

  it("returns undefined when no token is present", () => {
    expect(tokenFromRequest(url, {})).toBeUndefined()
  })
})
