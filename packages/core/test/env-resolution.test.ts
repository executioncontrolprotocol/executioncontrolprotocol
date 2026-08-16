import { describe, expect, it } from "vitest"
import { env, secrets, browser } from "../src/index.js"
import {
  PROCESS_ENV_RESOLVER_ID,
  SECRETS_RESOLVER_ID,
  BROWSER_SECRETS_RESOLVER_ID,
  resolveEnvConfigAsync,
} from "../src/environment/config-resolver.js"

describe("env resolution chain", () => {
  it("resolves $env via process-env resolver only", async () => {
    const config = await resolveEnvConfigAsync(
      { apiKey: env("OPENAI_API_KEY") },
      [
        { id: SECRETS_RESOLVER_ID, resolve: () => "from-secrets" },
        { id: PROCESS_ENV_RESOLVER_ID, resolve: (name) => (name === "OPENAI_API_KEY" ? "from-env" : undefined) },
      ]
    )
    expect(config.apiKey).toBe("from-env")
  })

  it("resolves $secret via secrets resolver only", async () => {
    const config = await resolveEnvConfigAsync(
      { apiKey: secrets("openai/api-key") },
      [
        { id: SECRETS_RESOLVER_ID, resolve: (name) => (name === "openai/api-key" ? "sk-secret" : undefined) },
        { id: PROCESS_ENV_RESOLVER_ID, resolve: () => "from-env" },
      ]
    )
    expect(config.apiKey).toBe("sk-secret")
  })

  it("resolves $browser via browser-secrets resolver only", async () => {
    const config = await resolveEnvConfigAsync(
      { apiKey: browser("OPENAI_API_KEY") },
      [
        { id: BROWSER_SECRETS_RESOLVER_ID, resolve: (name) => (name === "OPENAI_API_KEY" ? "sk-browser" : undefined) },
        { id: PROCESS_ENV_RESOLVER_ID, resolve: () => "from-env" },
      ]
    )
    expect(config.apiKey).toBe("sk-browser")
  })

  it("does not fall through browser-secrets resolver for $env", async () => {
    await expect(
      resolveEnvConfigAsync({ x: env("SHARED_KEY") }, [
        { id: BROWSER_SECRETS_RESOLVER_ID, resolve: () => "from-browser-secrets" },
      ])
    ).rejects.toThrow("SHARED_KEY")
  })

  it("does not fall through secrets resolver for $env", async () => {
    await expect(
      resolveEnvConfigAsync({ x: env("SHARED_KEY") }, [
        { id: SECRETS_RESOLVER_ID, resolve: () => "from-secrets" },
      ])
    ).rejects.toThrow("SHARED_KEY")
  })

  it("uses optional fallback when unresolved", async () => {
    const config = await resolveEnvConfigAsync(
      { x: env("MISSING", { optional: true, fallback: "fb" }) },
      []
    )
    expect(config.x).toBe("fb")
  })

  it("throws when required env missing", async () => {
    await expect(
      resolveEnvConfigAsync({ x: env("REQUIRED") }, [])
    ).rejects.toThrow("REQUIRED")
  })

  it("tells the user to bind secrets when the secrets resolver is missing", async () => {
    await expect(
      resolveEnvConfigAsync({ x: secrets("azure-blob-storage/connection-string") }, [])
    ).rejects.toThrow(
      'Secret azure-blob-storage/connection-string cannot be resolved; bind extension("@executioncontrolprotocol/secrets") in the environment'
    )
  })

  it("tells the user to bind browser-secrets when that resolver is missing", async () => {
    await expect(resolveEnvConfigAsync({ x: browser("OPENAI_API_KEY") }, [])).rejects.toThrow(
      'Browser secret OPENAI_API_KEY cannot be resolved; bind extension("@executioncontrolprotocol/browser-secrets") in the environment'
    )
  })

  it("keeps is-not-set when the secrets resolver is bound but the key is missing", async () => {
    await expect(
      resolveEnvConfigAsync({ x: secrets("missing/key") }, [
        { id: SECRETS_RESOLVER_ID, resolve: () => undefined },
      ])
    ).rejects.toThrow("Secret missing/key is not set")
  })

  it("uses optional fallback when secrets resolver is missing", async () => {
    const config = await resolveEnvConfigAsync(
      { x: secrets("missing/key", { optional: true, fallback: "fb" }) },
      []
    )
    expect(config.x).toBe("fb")
  })
})
