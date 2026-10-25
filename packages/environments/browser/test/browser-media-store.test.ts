import { afterEach, describe, expect, it, vi } from "vitest"
import {
  FILE_ARTIFACT_URI_PREFIX,
  MEDIA_HTTP_PATH,
  MediaStore,
  bytesToBase64,
  createCapabilityBlobStore,
  isBrowserFileLocator,
} from "@executioncontrolprotocol/core"
import { FILE_REF_KINDS } from "@executioncontrolprotocol/core/types"
import {
  BROWSER_ENVIRONMENT_ID,
  createBrowserEnvironment,
  createBrowserMediaStore,
} from "../src/index.js"

describe("createBrowserMediaStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("stashes writes as ecp://browser refs when no host is paired", async () => {
    const blobs = createCapabilityBlobStore()
    const store = createBrowserMediaStore()
    const ref = await store.write(
      new Uint8Array([1, 2]),
      { mediaType: "image/png", name: "a.png" },
      { blobs }
    )
    expect(ref.kind).toBe(FILE_REF_KINDS.FILE)
    if (ref.kind !== FILE_REF_KINDS.FILE) throw new Error("expected file")
    expect(isBrowserFileLocator(ref.path)).toBe(true)
    const resolved = await store.read(ref, { blobs })
    expect([...resolved.bytes]).toEqual([1, 2])
  })

  it("rejects disk paths and ecp://file reads without a paired host", async () => {
    const store = createBrowserMediaStore()
    await expect(
      store.read({ kind: FILE_REF_KINDS.FILE, path: "./photo.jpg" }, {})
    ).rejects.toThrow(/paired Node host/)
    await expect(
      store.read(
        { kind: FILE_REF_KINDS.ARTIFACT, uri: `${FILE_ARTIFACT_URI_PREFIX}a.png` },
        {}
      )
    ).rejects.toThrow(/paired Node host/)
  })

  it("uploads writes to a paired host and reads ecp://file back", async () => {
    const store = createBrowserMediaStore()
    const posted = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        kind: FILE_REF_KINDS.ARTIFACT,
        uri: `${FILE_ARTIFACT_URI_PREFIX}artifacts/media/out.png`,
        mediaType: "image/png",
        name: "out.png",
        sizeBytes: 2,
      }),
    }))
    const got = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        bytes: bytesToBase64(new Uint8Array([9, 10])),
        mediaType: "image/png",
        name: "out.png",
        sizeBytes: 2,
      }),
    }))
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return posted(url, init)
      return got(url, init)
    })
    const remoteInvoke = { url: "http://127.0.0.1:9", token: "tok" }
    const ref = await store.write(
      new Uint8Array([9, 10]),
      { mediaType: "image/png", name: "out.png" },
      { remoteInvoke }
    )
    expect(ref.kind).toBe(FILE_REF_KINDS.ARTIFACT)
    expect(posted).toHaveBeenCalled()
    const postUrl = String(posted.mock.calls[0]?.[0])
    expect(postUrl).toContain(MEDIA_HTTP_PATH)
    const resolved = await store.read(ref, { remoteInvoke })
    expect([...resolved.bytes]).toEqual([9, 10])
    expect(got).toHaveBeenCalled()
  })

  it("binds a browser MediaStore on createBrowserEnvironment()", () => {
    const env = createBrowserEnvironment(BROWSER_ENVIRONMENT_ID, "media-bind")
    expect(env.get(MediaStore)?.service).toBe(MediaStore.id)
  })

  it("fails closed when the paired host write is not ok", async () => {
    const store = createBrowserMediaStore()
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, json: async () => ({}) }))
    await expect(
      store.write(new Uint8Array([1]), { mediaType: "image/png" }, {
        remoteInvoke: { url: "http://127.0.0.1:9", token: "tok" },
      })
    ).rejects.toThrow(/media write failed \(401\)/)
  })

  it("rejects writes without blobs when no host is paired", async () => {
    const store = createBrowserMediaStore()
    await expect(
      store.write(new Uint8Array([1]), { mediaType: "image/png" }, {})
    ).rejects.toThrow(/ctx.blobs/)
  })
})
