import { describe, expect, it, beforeEach } from "vitest"
import { createBrowserDemoEnvironment, registerBrowserDefaults } from "../../src/environment.js"
import {
  getBrowserSecret,
  hasBrowserVault,
  isBrowserVaultUnlocked,
  lockBrowserVault,
  resetBrowserSecretsVault,
  setBrowserSecret,
  setupBrowserVault,
  unlockBrowserVault,
} from "@executioncontrolprotocol/browser-secrets"
import { browser } from "@executioncontrolprotocol/browser"
import { BROWSER_SECRETS_RESOLVER_ID, resolveEnvConfigAsync } from "@executioncontrolprotocol/core"

describe("@executioncontrolprotocol/browser-secrets in browser", () => {
  beforeEach(() => {
    localStorage.clear()
    resetBrowserSecretsVault()
  })

  it("unlock, set, and resolve via localStorage vault", async () => {
    await setupBrowserVault("browser-pass")
    await setBrowserSecret("OPENAI_API_KEY", "sk-live")
    lockBrowserVault()
    expect(isBrowserVaultUnlocked()).toBe(false)
    expect(await unlockBrowserVault("browser-pass")).toBe(true)
    expect(hasBrowserVault()).toBe(true)

    const config = await resolveEnvConfigAsync(
      { apiKey: browser("OPENAI_API_KEY") },
      [{ id: BROWSER_SECRETS_RESOLVER_ID, resolve: (name) => getBrowserSecret(name) }]
    )
    expect(config.apiKey).toBe("sk-live")
  })

  it("registers with browser demo environment", async () => {
    await registerBrowserDefaults()
    const env = createBrowserDemoEnvironment("secrets-browser")
    const ecp = await env.init()
    const desc = await ecp.describe({ extensions: { match: "browser-secrets" } })
    expect(desc.extensions.some((e) => e.id === "@executioncontrolprotocol/browser-secrets")).toBe(true)
  })
})
