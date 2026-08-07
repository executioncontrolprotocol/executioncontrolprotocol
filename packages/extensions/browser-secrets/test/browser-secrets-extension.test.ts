import { describe, expect, it, beforeEach } from "vitest"
import {
  browserSecretsExtension,
  createMemoryVaultStorage,
  getBrowserSecret,
  hasBrowserVault,
  isBrowserVaultUnlocked,
  listBrowserSecretKeys,
  lockBrowserVault,
  resetBrowserSecretsVault,
  setBrowserSecret,
  setBrowserSecretsStorage,
  setupBrowserVault,
  unlockBrowserVault,
} from "../src/index.js"
import { catalogExtension, getCatalogedExtension, browser, BROWSER_SECRETS_RESOLVER_ID, resolveEnvConfigAsync } from "@executioncontrolprotocol/core"

describe("@executioncontrolprotocol/browser-secrets extension", () => {
  beforeEach(() => {
    resetBrowserSecretsVault()
    setBrowserSecretsStorage(createMemoryVaultStorage())
  })

  it("catalogs on load", () => {
    catalogExtension(browserSecretsExtension)
    expect(getCatalogedExtension("@executioncontrolprotocol/browser-secrets")).toBeDefined()
  })

  it("setup, unlock, and round-trip secrets", async () => {
    expect(hasBrowserVault()).toBe(false)
    await setupBrowserVault("my-passphrase")
    expect(hasBrowserVault()).toBe(true)
    expect(isBrowserVaultUnlocked()).toBe(true)
    await setBrowserSecret("OPENAI_API_KEY", "sk-test")
    expect(await getBrowserSecret("OPENAI_API_KEY")).toBe("sk-test")
    expect(await listBrowserSecretKeys()).toContain("OPENAI_API_KEY")
    lockBrowserVault()
    expect(isBrowserVaultUnlocked()).toBe(false)
    expect(await getBrowserSecret("OPENAI_API_KEY")).toBeUndefined()
    expect(await unlockBrowserVault("my-passphrase")).toBe(true)
    expect(await getBrowserSecret("OPENAI_API_KEY")).toBe("sk-test")
    expect(await unlockBrowserVault("wrong")).toBe(false)
  })

  it("resolves $browser via store", async () => {
    await setupBrowserVault("pass")
    await setBrowserSecret("KEY", "value")
    const config = await resolveEnvConfigAsync(
      { token: browser("KEY") },
      [{ id: BROWSER_SECRETS_RESOLVER_ID, resolve: (name) => getBrowserSecret(name) }]
    )
    expect(config.token).toBe("value")
  })
})
