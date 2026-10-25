import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { FILE_ARTIFACT_URI_PREFIX, MEDIA_HTTP_PATH, bytesToBase64 } from "@executioncontrolprotocol/core"
import { FILE_REF_KINDS } from "@executioncontrolprotocol/core/types"
import { createDiskMediaStore, handleMediaHttp } from "../src/index.js"

describe("handleMediaHttp", () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it("ignores other paths", async () => {
    const result = await handleMediaHttp({
      store: createDiskMediaStore({ root: tmpdir() }),
      method: "GET",
      url: new URL("http://127.0.0.1/api/source"),
    })
    expect(result).toBeUndefined()
  })

  it("writes on POST and reads on GET", async () => {
    const root = await mkdtemp(join(tmpdir(), "ecp-http-"))
    dirs.push(root)
    const store = createDiskMediaStore({ root })
    const bytes = new Uint8Array([11, 12, 13])
    const posted = await handleMediaHttp({
      store,
      method: "POST",
      url: new URL(`http://127.0.0.1${MEDIA_HTTP_PATH}`),
      body: {
        bytes: bytesToBase64(bytes),
        mediaType: "image/png",
        name: "n.png",
        prefix: "out",
      },
    })
    expect(posted?.status).toBe(200)
    const ref = posted?.json as { kind: string; uri: string }
    expect(ref.kind).toBe(FILE_REF_KINDS.ARTIFACT)
    expect(ref.uri).toBe(`${FILE_ARTIFACT_URI_PREFIX}out/n.png`)

    const got = await handleMediaHttp({
      store,
      method: "GET",
      url: new URL(`http://127.0.0.1${MEDIA_HTTP_PATH}?uri=${encodeURIComponent(ref.uri)}`),
    })
    expect(got?.status).toBe(200)
    const body = got?.json as { bytes: string; sizeBytes: number }
    expect(body.sizeBytes).toBe(3)
    expect(body.bytes).toBe(bytesToBase64(bytes))
  })

  it("rejects unsupported methods", async () => {
    const result = await handleMediaHttp({
      store: createDiskMediaStore({ root: tmpdir() }),
      method: "DELETE",
      url: new URL(`http://127.0.0.1${MEDIA_HTTP_PATH}`),
    })
    expect(result?.status).toBe(405)
  })

  it("rejects POST without bytes and GET without uri", async () => {
    const root = await mkdtemp(join(tmpdir(), "ecp-http-"))
    dirs.push(root)
    const store = createDiskMediaStore({ root })
    const badPost = await handleMediaHttp({
      store,
      method: "POST",
      url: new URL(`http://127.0.0.1${MEDIA_HTTP_PATH}`),
      body: {},
    })
    expect(badPost?.status).toBe(400)
    const badGet = await handleMediaHttp({
      store,
      method: "GET",
      url: new URL(`http://127.0.0.1${MEDIA_HTTP_PATH}`),
    })
    expect(badGet?.status).toBe(400)
  })
})
