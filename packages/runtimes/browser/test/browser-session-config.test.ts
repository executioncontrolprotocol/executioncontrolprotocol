import { describe, expect, it } from "vitest"
import { env } from "@executioncontrolprotocol/core"
import { setBrowserSessionValue } from "../src/extensions/browser-session-config.js"
import { resolveEnvConfigAsync } from "@executioncontrolprotocol/core"

describe("@executioncontrolprotocol/browser-session-config", () => {
  it("resolves session values in memory", async () => {
    setBrowserSessionValue("OPENAI_API_KEY", "user-key")
    const config = await resolveEnvConfigAsync(
      { key: env("OPENAI_API_KEY") },
      [
        {
          id: "@executioncontrolprotocol/browser-session-config",
          resolve(name) {
            return name === "OPENAI_API_KEY" ? "user-key" : undefined
          },
        },
      ]
    )
    expect(config.key).toBe("user-key")
  })
})
