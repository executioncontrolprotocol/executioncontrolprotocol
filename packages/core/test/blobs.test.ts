import { describe, expect, it } from "vitest"
import {
  BROWSER_FILE_LOCATOR_PREFIX,
  collectBrowserLocators,
  createBrowserFileLocator,
  createCapabilityBlobStore,
  hydrateCapabilityBlobs,
  isBrowserFileLocator,
  serializeCapabilityBlobs,
  stashCapabilityBlob,
} from "../src/index.js"

describe("browser file locators", () => {
  it("creates locators under the browser prefix", () => {
    const locator = createBrowserFileLocator()
    expect(locator.startsWith(BROWSER_FILE_LOCATOR_PREFIX)).toBe(true)
    expect(isBrowserFileLocator(locator)).toBe(true)
  })

  it("rejects incomplete or unrelated strings", () => {
    expect(isBrowserFileLocator(BROWSER_FILE_LOCATOR_PREFIX)).toBe(false)
    expect(isBrowserFileLocator("ecp://host/x")).toBe(false)
    expect(isBrowserFileLocator("./photo.png")).toBe(false)
  })

  it("stashes and retrieves blobs", () => {
    const store = createCapabilityBlobStore()
    const blob = {
      name: "photo.png",
      type: "image/png",
      size: 4,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    }
    const locator = stashCapabilityBlob(store, blob)
    expect(store.get(locator)).toBe(blob)
    store.delete(locator)
    expect(store.get(locator)).toBeUndefined()
  })

  it("clears the map", () => {
    const store = createCapabilityBlobStore()
    stashCapabilityBlob(store, {
      name: "a",
      type: "text/plain",
      size: 0,
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    expect(store.size()).toBe(1)
    store.clear()
    expect(store.size()).toBe(0)
  })

  it("collects locators from nested payloads", () => {
    const locator = `${BROWSER_FILE_LOCATOR_PREFIX}abc`
    expect(
      collectBrowserLocators({
        image: { kind: "file", path: locator },
        source: locator,
        nested: [{ uri: `${BROWSER_FILE_LOCATOR_PREFIX}def` }],
      })
    ).toEqual([locator, `${BROWSER_FILE_LOCATOR_PREFIX}def`])
  })

  it("collects ImageRef file.path and artifact.uri browser locators for host hops", () => {
    const fileLoc = `${BROWSER_FILE_LOCATOR_PREFIX}file-1`
    const artLoc = `${BROWSER_FILE_LOCATOR_PREFIX}art-1`
    expect(
      collectBrowserLocators({
        image: { kind: "file", path: fileLoc, mediaType: "image/png" },
        overlay: { kind: "artifact", uri: artLoc },
      })
    ).toEqual([fileLoc, artLoc])
  })

  it("serializes and hydrates blobs for host hops", async () => {
    const store = createCapabilityBlobStore()
    const locator = stashCapabilityBlob(store, {
      name: "a.png",
      type: "image/png",
      size: 3,
      arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
    })
    const serialized = await serializeCapabilityBlobs(store, [locator])
    expect(serialized[locator]?.dataBase64).toBeTruthy()
    const hostStore = createCapabilityBlobStore()
    hydrateCapabilityBlobs(hostStore, serialized)
    const restored = hostStore.get(locator)
    expect(restored?.name).toBe("a.png")
    expect(new Uint8Array(await restored!.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]))
  })
})
