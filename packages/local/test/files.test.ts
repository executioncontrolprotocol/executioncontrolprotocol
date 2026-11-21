import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createEnvironment } from "@executioncontrolprotocol/engine"
import { MemoryArtifactStore, MemoryScratchSpace } from "@executioncontrolprotocol/engine/testing"
import {
  ArtifactStore,
  DEFAULT_FILE_MAX_BYTES_SETTINGS,
  ScratchSpace,
  type FileMediaTypeNote,
} from "@executioncontrolprotocol/protocol"
import { createFileService, resolveFileRefPath, stripUrlForDisplay } from "../src/plugins/files.js"
import { LocalArtifactStore } from "../src/storage/artifact-store.js"
import { LocalScratchSpace } from "../src/storage/scratch-space.js"

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])

let home: string
let server: http.Server
let base: string

beforeAll(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "ecp-files-"))
  server = http.createServer((req, res) => {
    if (req.url?.startsWith("/fail")) {
      res.writeHead(500)
      res.end("nope")
    } else if (req.url?.startsWith("/chunked")) {
      // No content-length: the cap has to be enforced while streaming.
      res.writeHead(200, { "content-type": "application/octet-stream" })
      for (let i = 0; i < 8; i++) res.write(Buffer.alloc(512, i))
      res.end()
    } else if (req.url?.startsWith("/image")) {
      res.writeHead(200, { "content-type": "image/jpeg" })
      res.end(Buffer.from(PNG))
    } else {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("from-url")
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("expected TCP address")
  base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
})

async function localService(runId: string, options: { executionDir?: string; maxBytes?: number } = {}) {
  const env = await createEnvironment()
    .use(LocalArtifactStore, ArtifactStore)
    .use(LocalScratchSpace, ScratchSpace)
    .start({ home })
  const notes: FileMediaTypeNote[] = []
  const cap = options.maxBytes
  const service = createFileService({
    runId,
    stepId: "step",
    executionDir: options.executionDir,
    artifacts: env.services.get(ArtifactStore),
    scratch: env.services.get(ScratchSpace),
    maxBytes: cap
      ? { ...DEFAULT_FILE_MAX_BYTES_SETTINGS, bytes: cap, stream: cap, path: cap, url: cap }
      : DEFAULT_FILE_MAX_BYTES_SETTINGS,
    mediaTypeNotes: notes,
  })
  return { ...service, notes, stop: () => env.stop() }
}

describe("file service on the local stores", () => {
  it("reads file and url refs, writes artifacts, and reads them back by URI", async () => {
    const svc = await localService("run-files")
    const filePath = path.join(home, "local.bin")
    await writeFile(filePath, Buffer.from([9, 8, 7]))

    expect((await svc.files.read({ kind: "file", path: filePath })).bytes).toEqual(new Uint8Array([9, 8, 7]))
    const fromUrl = await svc.files.read({ kind: "url", url: `${base}/payload.txt` })
    expect(Buffer.from(fromUrl.bytes).toString("utf8")).toBe("from-url")
    expect(fromUrl.mediaType).toContain("text/plain")

    const written = await svc.files.writeArtifact(new Uint8Array([9, 8, 7]), {
      mediaType: "application/octet-stream",
      name: "out.bin",
    })
    expect(written).toMatchObject({ kind: "artifact", uri: "ecp://runs/run-files/artifacts/out.bin", sizeBytes: 3 })
    expect(await readFile(path.join(home, "runs", "run-files", "artifacts", "out.bin"))).toEqual(Buffer.from([9, 8, 7]))
    expect((await svc.files.read({ kind: "artifact", uri: written.uri })).bytes).toEqual(new Uint8Array([9, 8, 7]))

    const unnamed = await svc.files.writeArtifact(new Uint8Array([1]), { mediaType: "application/octet-stream" })
    expect(unnamed.name).toMatch(/^artifact-\d+-[0-9a-f]{8}\.bin$/)
    await svc.stop()
  })

  it("reads an artifact from the run its URI names, not the current run", async () => {
    const first = await localService("run-a")
    const ref = await first.files.fromBytes(new Uint8Array([4, 2]), { name: "keep.bin" })
    await first.stop()
    const second = await localService("run-b")
    expect((await second.files.bytes(ref)).bytes).toEqual(new Uint8Array([4, 2]))
    await second.stop()
  })

  it("rejects artifact names and URIs that would leave the run", async () => {
    const svc = await localService("run-names")
    for (const name of ["../escape.bin", "a/b.bin", "..", ".hidden"]) {
      await expect(svc.files.fromBytes(new Uint8Array([1]), { name })).rejects.toMatchObject({
        code: "ECP_INPUT_INVALID",
      })
    }
    await expect(
      svc.files.bytes({ kind: "artifact", uri: "ecp://runs/run-names/artifacts/..%2F..%2Fx" }),
    ).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })
    await expect(svc.files.bytes({ kind: "artifact", uri: "file:///etc/passwd" })).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
    await svc.stop()
  })

  it("resolves relative file paths against executionDir and rejects them without one", async () => {
    const executionDir = path.join(home, "exec-dir")
    await mkdir(path.join(executionDir, "subdir"), { recursive: true })
    await writeFile(path.join(executionDir, "subdir", "relative.psd"), Buffer.from("psd"))
    const svc = await localService("run-rel", { executionDir })
    const relative = await svc.files.read({ kind: "file", path: "subdir/relative.psd" })
    expect(Buffer.from(relative.bytes).toString()).toBe("psd")
    await svc.stop()

    const inline = await localService("run-inline")
    await expect(inline.files.read({ kind: "file", path: "missing.psd" })).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
    await inline.stop()
    const hostAbs = process.platform === "win32" ? "C:\\data\\host.psd" : "/tmp/host.psd"
    expect(resolveFileRefPath(hostAbs, undefined)).toBe(hostAbs)
  })

  it("reports failed fetches as provider errors without the query string", async () => {
    const svc = await localService("run-fail")
    await expect(svc.files.read({ kind: "url", url: `${base}/fail?token=secret` })).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: expect.not.stringContaining("token=secret"),
    })
    await svc.stop()
  })

  it("enforces the size cap while streaming when there is no content-length", async () => {
    const svc = await localService("run-cap", { maxBytes: 1024 })
    await expect(svc.files.bytes({ kind: "url", url: `${base}/chunked` })).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
    const handle = await svc.files.stream({ kind: "url", url: `${base}/chunked` })
    await expect(new Response(handle.stream).arrayBuffer()).rejects.toBeDefined()
    await expect(svc.files.fromStream(new Response(new Uint8Array(2048)).body!)).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
    expect((await svc.files.bytes({ kind: "url", url: `${base}/payload.txt` })).bytes.byteLength).toBe(8)
    await svc.releaseStep()
    await svc.stop()
  })

  it("sniffs every write and records corrections, including declared types", async () => {
    const svc = await localService("run-sniff")
    const labelled = await svc.files.fromBytes(PNG, { mediaType: "image/jpeg", name: "mislabelled.bin" })
    expect(labelled.mediaType).toBe("image/png")
    const streamed = await svc.files.fromStream(new Response(PNG).body!, { name: "streamed.bin" })
    expect(streamed.mediaType).toBe("image/png")
    const fromUrl = await svc.files.bytes({ kind: "url", url: `${base}/image` })
    expect(fromUrl.mediaType).toBe("image/png")
    expect(svc.notes.map((note) => [note.declared, note.sniffed])).toEqual([
      ["image/jpeg", "image/png"],
      ["image/jpeg", "image/png"],
    ])
    await svc.stop()
  })

  it("persists a url with fromUrl, and leaves it a reference otherwise", async () => {
    const svc = await localService("run-fromurl")
    expect(await svc.files.fromUrl(`${base}/payload.txt`)).toMatchObject({ kind: "url" })
    const kept = await svc.files.fromUrl(`${base}/payload.txt?sig=1`, { persist: true })
    expect(kept).toMatchObject({ kind: "artifact", name: "payload.txt" })
    expect(Buffer.from((await svc.files.bytes(kept)).bytes).toString()).toBe("from-url")
    await svc.stop()
  })

  it("gives local paths for files and local artifacts, scratch copies for urls, and cleans up at step end", async () => {
    const svc = await localService("run-paths")
    const filePath = path.join(home, "sample.txt")
    await writeFile(filePath, "hello")
    expect(await svc.files.path({ kind: "file", path: filePath })).toMatchObject({ path: filePath, temporary: false })
    const artifact = await svc.files.fromPath(filePath)
    expect(artifact.name).toBe("sample.txt")
    expect(await svc.files.path(artifact)).toMatchObject({ temporary: false })
    const copy = await svc.files.path({ kind: "url", url: `${base}/payload.txt` })
    expect(copy.temporary).toBe(true)
    expect(await readFile(copy.path, "utf8")).toBe("from-url")
    await expect(svc.files.url({ kind: "file", path: filePath })).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })

    const streamed = await svc.files.stream({ kind: "file", path: filePath })
    const reader = streamed.stream.getReader()
    expect(Buffer.from((await reader.read()).value!).toString()).toBe("hello")
    await svc.releaseStep()
    await expect(stat(copy.path)).rejects.toMatchObject({ code: "ENOENT" })
    await svc.stop()
  })
})

describe("file service on stores without local files", () => {
  it("copies artifacts to scratch for path() when the store has no local path", async () => {
    const artifacts = new MemoryArtifactStore()
    const scratch = new MemoryScratchSpace()
    const { files, releaseStep } = createFileService({
      runId: "run-mem",
      stepId: "step",
      artifacts,
      scratch,
      maxBytes: DEFAULT_FILE_MAX_BYTES_SETTINGS,
      mediaTypeNotes: [],
    })
    const ref = await files.fromBytes(new Uint8Array([7, 7]), { name: "mem.bin" })
    const opened = await files.path(ref)
    expect(opened).toMatchObject({ temporary: true, path: "memory://run-mem/step/mem.bin" })
    expect(scratch.read("run-mem", "step", "mem.bin")).toEqual(new Uint8Array([7, 7]))
    await releaseStep()
    expect(scratch.hasStep("run-mem", "step")).toBe(false)
  })

  it("strips query strings from display URLs", () => {
    expect(stripUrlForDisplay("https://example.com/a?sig=secret")).toBe("https://example.com/a")
    expect(stripUrlForDisplay("not-a-url?x=1")).toBe("not-a-url")
  })
})
