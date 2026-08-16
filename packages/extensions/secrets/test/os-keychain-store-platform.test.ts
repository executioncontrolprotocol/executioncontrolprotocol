import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  ECP_KEYRING_SERVICE,
  ECP_SECRET_REF_PROTOCOL_PREFIX,
  ECP_SECRET_REF_WIN32_ENUM_FILTER,
} from "../src/constants.js"

const mocks = vi.hoisted(() => {
  const withTargetCalls: Array<[string, string, string]> = []
  const entryCtorCalls: Array<[string, string]> = []
  const setPassword = vi.fn()
  const getPassword = vi.fn()
  const deletePassword = vi.fn()
  const findCredentials = vi.fn()

  function makeEntryInstance() {
    return { setPassword, getPassword, deletePassword }
  }

  class MockEntry {
    constructor(service: string, user: string) {
      entryCtorCalls.push([service, user])
      return makeEntryInstance() as unknown as MockEntry
    }

    static withTarget(target: string, service: string, user: string) {
      withTargetCalls.push([target, service, user])
      return makeEntryInstance()
    }
  }

  return {
    withTargetCalls,
    entryCtorCalls,
    setPassword,
    getPassword,
    deletePassword,
    findCredentials,
    MockEntry,
  }
})

vi.mock("@napi-rs/keyring", () => ({
  Entry: mocks.MockEntry,
  findCredentials: mocks.findCredentials,
}))

const { OsKeychainSecretsStore } = await import("../src/os-keychain-store.js")

function stubPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  })
}

describe("OsKeychainSecretsStore platform entry construction", () => {
  const originalPlatform = process.platform
  let store: InstanceType<typeof OsKeychainSecretsStore>

  beforeEach(() => {
    mocks.withTargetCalls.length = 0
    mocks.entryCtorCalls.length = 0
    mocks.setPassword.mockReset()
    mocks.getPassword.mockReset()
    mocks.deletePassword.mockReset()
    mocks.findCredentials.mockReset()
    store = new OsKeychainSecretsStore()
  })

  afterEach(() => {
    stubPlatform(originalPlatform)
  })

  describe("positive: win32 uses withTarget(ecp://…)", () => {
    beforeEach(() => {
      stubPlatform("win32")
    })

    it("set calls withTarget with ecp:// target then setPassword", async () => {
      await store.set("server/fetch.token", "secret-value")
      expect(mocks.withTargetCalls).toEqual([
        [
          `${ECP_SECRET_REF_PROTOCOL_PREFIX}server/fetch.token`,
          ECP_KEYRING_SERVICE,
          "server/fetch.token",
        ],
      ])
      expect(mocks.entryCtorCalls).toEqual([])
      expect(mocks.setPassword).toHaveBeenCalledWith("secret-value")
    })

    it("get and delete use the same withTarget args as set", async () => {
      mocks.getPassword.mockReturnValue("stored")
      await expect(store.get("server/fetch.token")).resolves.toBe("stored")
      await store.delete("server/fetch.token")

      expect(mocks.withTargetCalls).toEqual([
        [
          `${ECP_SECRET_REF_PROTOCOL_PREFIX}server/fetch.token`,
          ECP_KEYRING_SERVICE,
          "server/fetch.token",
        ],
        [
          `${ECP_SECRET_REF_PROTOCOL_PREFIX}server/fetch.token`,
          ECP_KEYRING_SERVICE,
          "server/fetch.token",
        ],
      ])
      expect(mocks.entryCtorCalls).toEqual([])
      expect(mocks.deletePassword).toHaveBeenCalledOnce()
    })
  })

  describe("negative: darwin and linux never pass ecp:// to withTarget", () => {
    it.each(["darwin", "linux"] as const)(
      "%s uses plain Entry and never withTarget",
      async (platform) => {
        stubPlatform(platform)

        await store.set("server/fetch.token", "secret-value")
        mocks.getPassword.mockReturnValue("stored")
        await expect(store.get("server/fetch.token")).resolves.toBe("stored")
        await store.delete("server/fetch.token")

        expect(mocks.entryCtorCalls).toEqual([
          [ECP_KEYRING_SERVICE, "server/fetch.token"],
          [ECP_KEYRING_SERVICE, "server/fetch.token"],
          [ECP_KEYRING_SERVICE, "server/fetch.token"],
        ])
        expect(mocks.withTargetCalls).toEqual([])
        expect(
          mocks.withTargetCalls.some(([target]) =>
            target.startsWith(ECP_SECRET_REF_PROTOCOL_PREFIX)
          )
        ).toBe(false)
        expect(mocks.setPassword).toHaveBeenCalledWith("secret-value")
        expect(mocks.deletePassword).toHaveBeenCalledOnce()
      }
    )
  })

  describe("edge", () => {
    it("canonicalizes backslash and whitespace on win32 target and account", async () => {
      stubPlatform("win32")
      await store.set("  a\\b\\c  ", "v")
      expect(mocks.withTargetCalls).toEqual([
        [`${ECP_SECRET_REF_PROTOCOL_PREFIX}a/b/c`, ECP_KEYRING_SERVICE, "a/b/c"],
      ])
      expect(mocks.entryCtorCalls).toEqual([])
    })

    it("canonicalizes backslash and whitespace on darwin account", async () => {
      stubPlatform("darwin")
      await store.set("  a\\b\\c  ", "v")
      expect(mocks.entryCtorCalls).toEqual([[ECP_KEYRING_SERVICE, "a/b/c"]])
      expect(mocks.withTargetCalls).toEqual([])
    })

    it("list on win32 passes ecp://* enumerate filter", async () => {
      stubPlatform("win32")
      mocks.findCredentials.mockReturnValue([{ account: "server/fetch.token", password: "x" }])
      await expect(store.list()).resolves.toEqual(["server/fetch.token"])
      expect(mocks.findCredentials).toHaveBeenCalledWith(
        ECP_KEYRING_SERVICE,
        ECP_SECRET_REF_WIN32_ENUM_FILTER
      )
    })

    it("list on non-Windows does not pass enumerate filter", async () => {
      stubPlatform("darwin")
      mocks.findCredentials.mockReturnValue([{ account: "server/fetch.token", password: "x" }])
      await expect(store.list()).resolves.toEqual(["server/fetch.token"])
      expect(mocks.findCredentials).toHaveBeenCalledWith(ECP_KEYRING_SERVICE)
      expect(mocks.findCredentials.mock.calls[0]).toHaveLength(1)
    })

    it("get returns undefined when credential is missing (win32)", async () => {
      stubPlatform("win32")
      mocks.getPassword.mockImplementation(() => {
        throw new Error("NoEntry")
      })
      await expect(store.get("missing")).resolves.toBeUndefined()
    })

    it("get returns undefined when credential is missing (darwin)", async () => {
      stubPlatform("darwin")
      mocks.getPassword.mockImplementation(() => {
        throw new Error("NoEntry")
      })
      await expect(store.get("missing")).resolves.toBeUndefined()
    })

    it("delete does not throw when credential is missing (win32 and darwin)", async () => {
      mocks.deletePassword.mockImplementation(() => {
        throw new Error("NoEntry")
      })
      stubPlatform("win32")
      await expect(store.delete("missing")).resolves.toBeUndefined()
      stubPlatform("darwin")
      await expect(store.delete("missing")).resolves.toBeUndefined()
    })
  })
})
