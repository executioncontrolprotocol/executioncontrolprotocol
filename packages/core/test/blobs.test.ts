import { describe, expect, it } from "vitest"
import {
  BROWSER_FILE_LOCATOR_PREFIX,
  createBrowserFileLocator,
  createCapabilityBlobStore,
  isBrowserFileLocator,
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
})
