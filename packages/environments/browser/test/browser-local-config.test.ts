import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { env } from "@executioncontrolprotocol/core"
import { resolveEnvConfigAsync } from "@executioncontrolprotocol/core"

describe("@executioncontrolprotocol/browser-local-config", () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    ;(globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
      key: () => null,
      length: 0,
    } as Storage
  })

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it("reads allowed keys from localStorage", async () => {
    storage.set("ecp:THEME", JSON.stringify("dark"))
    const config = await resolveEnvConfigAsync(
      { theme: env("THEME") },
      [
        {
          id: "@executioncontrolprotocol/browser-local-config",
          resolve(name) {
            if (name === "OPENAI_API_KEY") throw new Error("refuses secret-like key")
            if (!["THEME"].includes(name)) return undefined
            const raw = globalThis.localStorage?.getItem(`ecp:${name}`)
            return raw ? JSON.parse(raw) : undefined
          },
        },
      ]
    )
    expect(config.theme).toBe("dark")
  })

  it("refuses secret-like keys", async () => {
    await expect(
      resolveEnvConfigAsync(
        { key: env("OPENAI_API_KEY") },
        [
          {
            id: "@executioncontrolprotocol/browser-local-config",
            resolve(name) {
              if (name.toUpperCase().includes("API_KEY")) {
                throw new Error(`browser-local-config refuses secret-like key: ${name}`)
              }
              return undefined
            },
          },
        ]
      )
    ).rejects.toThrow("refuses secret-like key")
  })
})
