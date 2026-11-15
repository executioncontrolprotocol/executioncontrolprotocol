import { afterEach, describe, expect, it } from "vitest"
import { createEnvironment } from "@executioncontrolprotocol/engine"
import { SecretsProvider } from "@executioncontrolprotocol/protocol"
import { envNameForKey, LocalSecrets } from "../src/index.js"

describe("LocalSecrets", () => {
  const key = `test.phase3.${Date.now()}`
  const envKey = envNameForKey(key)

  afterEach(async () => {
    delete process.env[envKey]
    try {
      const host = await createEnvironment().use(LocalSecrets, SecretsProvider).start({ home: "/tmp/ecp" })
      await host.services.get(SecretsProvider).delete(key)
      await host.stop()
    } catch {
      // keychain may be unavailable
    }
  })

  it("rejects invalid keys", async () => {
    const host = await createEnvironment().use(LocalSecrets, SecretsProvider).start({ home: "/tmp/ecp" })
    await expect(host.services.get(SecretsProvider).get("bad key!")).rejects.toMatchObject({
      code: "ECP_REQUEST_INVALID",
    })
    await host.stop()
  })

  it("reads from ECP_SECRET_* env fallback", async () => {
    process.env[envKey] = "from-env"
    const host = await createEnvironment().use(LocalSecrets, SecretsProvider).start({ home: "/tmp/ecp" })
    await expect(host.services.get(SecretsProvider).get(key)).resolves.toBe("from-env")
    await host.stop()
  })

  it("prefers keychain over env when available", async () => {
    const host = await createEnvironment().use(LocalSecrets, SecretsProvider).start({ home: "/tmp/ecp" })
    const secrets = host.services.get(SecretsProvider) as LocalSecrets
    const available = await secrets.isKeychainAvailable()
    if (!available) {
      await host.stop()
      return
    }
    process.env[envKey] = "from-env"
    await secrets.set(key, "from-keychain")
    await expect(secrets.get(key)).resolves.toBe("from-keychain")
    await secrets.delete(key)
    await host.stop()
  })

  it("round-trips through the OS keychain when available", async () => {
    const host = await createEnvironment().use(LocalSecrets, SecretsProvider).start({ home: "/tmp/ecp" })
    const secrets = host.services.get(SecretsProvider) as LocalSecrets
    if (!(await secrets.isKeychainAvailable())) {
      console.warn("skipping keychain round-trip: no Secret Service / keyring available")
      await host.stop()
      return
    }
    await secrets.set(key, "secret-value")
    await expect(secrets.get(key)).resolves.toBe("secret-value")
    expect(await secrets.list()).toContain(key)
    await expect(secrets.delete(key)).resolves.toBe(true)
    await expect(secrets.delete(key)).resolves.toBe(false)
    await host.stop()
  })

  it("lists env-backed keys that match the secret key pattern", async () => {
    const envOnly = "PLAINKEY"
    const envName = envNameForKey(envOnly)
    process.env[envName] = "x"
    const host = await createEnvironment().use(LocalSecrets, SecretsProvider).start({ home: "/tmp/ecp" })
    const listed = await host.services.get(SecretsProvider).list()
    expect(listed.some((item) => item.toUpperCase().includes("PLAINKEY") || item === envOnly)).toBe(true)
    delete process.env[envName]
    await expect(host.services.get(SecretsProvider).get(`missing.${Date.now()}`)).resolves.toBeUndefined()
    // Empty env string still counts as present.
    process.env[envName] = ""
    await expect(host.services.get(SecretsProvider).get(envOnly)).resolves.toBe("")
    delete process.env[envName]
    await host.stop()
  })
})
