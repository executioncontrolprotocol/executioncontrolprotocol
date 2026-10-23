import { describe, expect, it } from "vitest"
import { extension, secrets, testExtension } from "../src/index.js"
import {
  environment,
  NODE_ENVIRONMENT_ID,
  setMemorySecret,
  setSecretsStore,
  memorySecretsStore,
  resetSecretsStore,
} from "@executioncontrolprotocol/node"

describe("secret serialization", () => {
  it("does not embed resolved secrets in environment manifest", async () => {
    setSecretsStore(memorySecretsStore)
    setMemorySecret("API_KEY", "super-secret-value")
    const env = environment(NODE_ENVIRONMENT_ID, "secret-test").with([
      extension(testExtension).with({ token: secrets("API_KEY") }),
    ])
    await env.init()
    const manifest = env.compile()
    const json = JSON.stringify(manifest)
    expect(json).not.toContain("super-secret-value")
    expect(json).toContain("$secret")
    resetSecretsStore()
  })
})
