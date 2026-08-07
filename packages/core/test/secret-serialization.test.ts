import { describe, expect, it } from "vitest"
import { extension, secrets } from "../src/index.js"
import { createTestEnvironment } from "./helpers.js"
import {
  setMemorySecret,
  setSecretsStore,
  memorySecretsStore,
  resetSecretsStore,
} from "@executioncontrolprotocol/secrets"

describe("secret serialization", () => {
  it("does not embed resolved secrets in environment manifest", async () => {
    setSecretsStore(memorySecretsStore)
    setMemorySecret("API_KEY", "super-secret-value")
    const env = (await createTestEnvironment("secret-test")).withExtensions([
      extension("@executioncontrolprotocol/secrets").with({}),
      extension("@executioncontrolprotocol/test").with({ token: secrets("API_KEY") }),
    ])
    await env.init()
    const manifest = env.compile()
    const json = JSON.stringify(manifest)
    expect(json).not.toContain("super-secret-value")
    expect(json).toContain("$secret")
    resetSecretsStore()
  })
})
