import { describe, expect, it } from "vitest"
import { createEnvironment } from "@executioncontrolprotocol/engine"
import { Auth } from "@executioncontrolprotocol/protocol"
import {
  isAllowedHost,
  isAllowedOrigin,
  LocalTokenAuth,
  tokensEqual,
  generateHostToken,
} from "../src/index.js"

describe("LocalTokenAuth", () => {
  it("requires a token in options", async () => {
    await expect(
      createEnvironment().use(LocalTokenAuth, Auth, { options: {} }).start({
        home: "/tmp/ecp-auth-missing",
        mode: "in-process",
      }),
    ).rejects.toThrow(/token/)
  })

  it("compares tokens in constant time and validates Host/Origin", () => {
    const token = generateHostToken()
    expect(tokensEqual(token, token)).toBe(true)
    expect(tokensEqual(token, "a".repeat(token.length))).toBe(false)
    expect(isAllowedHost("127.0.0.1:51234", 51234)).toBe(true)
    expect(isAllowedHost("localhost:51234", 51234)).toBe(true)
    expect(isAllowedHost("evil.example:51234", 51234)).toBe(false)
    expect(isAllowedOrigin("http://127.0.0.1:51234", 51234)).toBe(true)
    expect(isAllowedOrigin("http://evil.example", 51234)).toBe(false)
  })

  it("authenticates bearer requests and rejects bad token Host Origin", async () => {
    const token = generateHostToken()
    const host = await createEnvironment()
      .use(LocalTokenAuth, Auth, { options: { token, port: 9 } })
      .start({ home: "/tmp/ecp-auth", mode: "in-process" })
    const auth = host.services.get(Auth) as LocalTokenAuth
    auth.setPort(9)

    await expect(
      auth.authenticate({
        headers: {
          authorization: `Bearer ${token}`,
          host: "127.0.0.1:9",
        },
      }),
    ).resolves.toEqual({ principal: "local" })

    await expect(
      auth.authenticate({
        headers: { authorization: "Bearer nope", host: "127.0.0.1:9" },
      }),
    ).resolves.toBeUndefined()

    await expect(
      auth.authenticate({
        headers: {
          authorization: `Bearer ${token}`,
          host: "evil:9",
        },
      }),
    ).resolves.toBeUndefined()

    await expect(
      auth.authenticate({
        headers: {
          authorization: `Bearer ${token}`,
          host: "127.0.0.1:9",
          origin: "http://evil.example",
        },
      }),
    ).resolves.toBeUndefined()

    await host.stop()
  })
})
