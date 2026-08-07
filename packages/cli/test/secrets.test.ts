import { describe, expect, it } from "vitest"
import { redactSecret, canonicalSecretKey } from "@executioncontrolprotocol/secrets"

describe("secrets helpers", () => {
  it("redacts secret values", () => {
    expect(redactSecret("short")).toBe("****")
    expect(redactSecret("abcdefghij")).toMatch(/\*\*\*\*/)
  })

  it("canonicalizes keys", () => {
    expect(canonicalSecretKey("  a/b\\c  ")).toBe("a/b/c")
  })
})
