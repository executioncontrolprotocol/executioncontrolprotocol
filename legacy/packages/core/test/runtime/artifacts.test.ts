import { describe, expect, it } from "vitest"
import { createCapabilityArtifactStore } from "../../src/runtime/artifacts.js"
import { createTestEnvironment } from "../helpers.js"

describe("CapabilityArtifactStore", () => {
  it("stores and returns artifacts by uri", () => {
    const store = createCapabilityArtifactStore()
    const bytes = new Uint8Array([1, 2, 3])
    store.set("ecp://artifacts/images/a.webp", {
      mediaType: "image/webp",
      name: "a.webp",
      size: 3,
      bytes,
    })
    expect(store.size()).toBe(1)
    const got = store.get("ecp://artifacts/images/a.webp")
    expect(got).toMatchObject({
      mediaType: "image/webp",
      name: "a.webp",
      size: 3,
    })
    expect(Array.from(got!.bytes)).toEqual([1, 2, 3])
  })

  it("lazy-creates artifact store on Ecp and invoke context", async () => {
    const env = await createTestEnvironment("artifact-store")
    expect(env.getArtifactStore()).toBeUndefined()
    const ecp = await env.init()
    const store = ecp.getArtifactStore()
    expect(store.size()).toBe(0)
    expect(env.getArtifactStore()).toBe(store)
    store.set("ecp://artifacts/x", {
      mediaType: "text/plain",
      size: 1,
      bytes: new Uint8Array([65]),
    })
    expect(ecp.getArtifactStore().get("ecp://artifacts/x")?.mediaType).toBe("text/plain")
    await ecp.terminate()
  })
})
