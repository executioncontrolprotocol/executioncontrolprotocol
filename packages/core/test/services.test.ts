import { describe, expect, it } from "vitest"
import {
  MediaStore,
  ServiceMap,
  createMemoryMediaStore,
  isService,
  snapshotServiceId,
  type ServiceProvider,
} from "../src/index.js"
import { createTestEnvironment } from "./helpers.js"

describe("ServiceProvider / ServiceMap", () => {
  it("treats a MediaStore as a ServiceProvider", () => {
    const store = createMemoryMediaStore()
    const provider: ServiceProvider = store
    expect(provider.service).toBe(MediaStore.id)
    expect(isService(provider, MediaStore)).toBe(true)
  })

  it("rejects assigning service through the ServiceProvider type", () => {
    const provider: ServiceProvider = { service: MediaStore.id }
    // @ts-expect-error service is readonly
    provider.service = "x"
    expect(typeof provider.service).toBe("string")
  })

  it("rejects a missing or empty service id at use() time", () => {
    const map = new ServiceMap()
    expect(() => map.use({} as ServiceProvider)).toThrow(/non-empty service id/)
    expect(() => map.use({ service: "" })).toThrow(/non-empty service id/)
  })

  it("returns the bound MediaStore from get(MediaStore)", () => {
    const store = createMemoryMediaStore()
    const env = createTestEnvironment("svc-get").use(store)
    expect(env.get(MediaStore)).toBe(store)
  })

  it("replaces a previous provider with the same id", () => {
    const first = createMemoryMediaStore()
    const second = createMemoryMediaStore()
    const env = createTestEnvironment("svc-replace").use(first).use(second)
    expect(env.get(MediaStore)).toBe(second)
  })

  it("stores an unknown id and returns it by its own token", () => {
    const Other = { id: "@example/Other" as const }
    const provider = { service: Other.id, ping: () => "ok" }
    const env = createTestEnvironment("svc-other").use(provider)
    expect(env.get(Other)?.ping()).toBe("ok")
    expect(env.get(MediaStore)).toBeUndefined()
  })

  it("isService narrows only on the matching id", () => {
    const store = createMemoryMediaStore()
    const other: ServiceProvider = { service: "@example/Other" }
    expect(isService(store, MediaStore)).toBe(true)
    expect(isService(other, MediaStore)).toBe(false)
  })

  it("snapshots the id at use() so a later mutation does not change the key", () => {
    const backing = createMemoryMediaStore()
    const provider = {
      service: MediaStore.id as string,
      read: backing.read.bind(backing),
      write: backing.write.bind(backing),
    }
    const env = createTestEnvironment("svc-snapshot").use(provider)
    expect(snapshotServiceId(provider)).toBe(MediaStore.id)
    provider.service = "@example/mutated"
    expect(env.get(MediaStore)).toBe(provider)
    expect(env.get({ id: "@example/mutated" })).toBeUndefined()
  })

  it("exposes getService on Ecp after init", async () => {
    const store = createMemoryMediaStore()
    const env = createTestEnvironment("svc-ecp").use(store)
    const ecp = await env.init()
    expect(ecp.getService(MediaStore)).toBe(store)
    await ecp.terminate()
  })

  it("is chainable with with()", () => {
    const store = createMemoryMediaStore()
    const env = createTestEnvironment("svc-chain").use(store)
    expect(env.get(MediaStore)).toBe(store)
  })
})
