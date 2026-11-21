import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createFileService } from "@executioncontrolprotocol/local"
import { DEFAULT_FILE_MAX_BYTES_SETTINGS } from "@executioncontrolprotocol/protocol"
import { MemoryArtifactStore } from "../src/testing/artifact-store.js"
import { MemoryScratchSpace } from "../src/testing/scratch-space.js"

describe("file service with in-memory artifact store", () => {
  let tempRoot: string
  let server: http.Server
  let baseUrl: string

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "ecp-file-svc-"))
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("from-url")
    })
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("expected TCP address")
    baseUrl = `http://127.0.0.1:${address.port}/payload.txt`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  function service(runId = "run-mem", stepId = "step-1") {
    const notes: Array<{ path: string; declared?: string; sniffed: string }> = []
    const artifacts = new MemoryArtifactStore()
    const scratch = new MemoryScratchSpace()
    return {
      notes,
      ...createFileService({
        runId,
        stepId,
        artifacts,
        scratch,
        maxBytes: { ...DEFAULT_FILE_MAX_BYTES_SETTINGS, bytes: 64 },
        mediaTypeNotes: notes,
      }),
    }
  }

  it("fromUrl with persist downloads into the artifact store", async () => {
    const { files } = service()
    const saved = await files.fromUrl(baseUrl, { persist: true, name: "saved.bin" })
    expect(saved).toMatchObject({ kind: "artifact", name: "saved.bin" })
  })

  it("round-trips file, url, and artifact through bytes and fromBytes", async () => {
    const filePath = path.join(tempRoot, "local.bin")
    await writeFile(filePath, Buffer.from([9, 8, 7]))
    const { files } = service()

    const fromFile = await files.bytes({ kind: "file", path: filePath })
    expect(fromFile.bytes).toEqual(new Uint8Array([9, 8, 7]))

    const fromUrl = await files.bytes({ kind: "url", url: baseUrl })
    expect(Buffer.from(fromUrl.bytes).toString("utf8")).toBe("from-url")

    const written = await files.fromBytes(fromFile.bytes, { mediaType: "application/octet-stream", name: "out.bin" })
    expect(written.uri).toBe("ecp://runs/run-mem/artifacts/out.bin")

    const fromArtifact = await files.bytes(written)
    expect(fromArtifact.bytes).toEqual(new Uint8Array([9, 8, 7]))
  })

  it("sniffs a mislabelled PNG and records mediaTypes", async () => {
    const pngPath = path.join(tempRoot, "bad-label.bin")
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
    await writeFile(pngPath, pngHeader)
    const { files, notes } = service()
    await files.bytes({ kind: "file", path: pngPath, mediaType: "image/jpeg" })
    expect(notes).toEqual([{ path: "ref.file", declared: "image/jpeg", sniffed: "image/png" }])
  })

  it("fromStream stores streamed bytes", async () => {
    const { files } = service()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([3, 3]))
        controller.close()
      },
    })
    const artifact = await files.fromStream(stream, { name: "streamed.bin" })
    expect(artifact.name).toBe("streamed.bin")
    const read = await files.bytes(artifact)
    expect(read.bytes).toEqual(new Uint8Array([3, 3]))
  })

  it("rejects url access on a file ref and removes scratch after release", async () => {
    const { files, releaseStep } = service("run-scratch", "step-url")
    await expect(files.url({ kind: "file", path: "/tmp/x" })).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
    const pathRef = await files.path({ kind: "url", url: baseUrl })
    expect(pathRef.temporary).toBe(true)
    await releaseStep()
    await expect(readFile(pathRef.path)).rejects.toThrow()
  })

  it("returns ECP_PROVIDER_ERROR without query string on HTTP errors", async () => {
    const failing = http.createServer((_req, res) => {
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>((resolve) => {
      failing.listen(0, "127.0.0.1", () => resolve())
    })
    try {
      const address = failing.address()
      if (!address || typeof address === "string") throw new Error("expected TCP address")
      const { files } = service()
      await expect(
        files.bytes({ kind: "url", url: `http://127.0.0.1:${address.port}/x?secret=1` }),
      ).rejects.toMatchObject({
        code: "ECP_PROVIDER_ERROR",
        message: expect.not.stringContaining("secret=1"),
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        failing.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it("keeps the declared type when magic is unknown", async () => {
    const unknownPath = path.join(tempRoot, "unknown.bin")
    await writeFile(unknownPath, Buffer.from([0, 1, 2]))
    const { files } = service()
    const read = await files.bytes({ kind: "file", path: unknownPath, mediaType: "application/custom" })
    expect(read.mediaType).toBe("application/custom")
  })

  it("rejects downloads over the bytes cap using content-length", async () => {
    const big = http.createServer((_req, res) => {
      res.writeHead(200, { "content-length": "128", "content-type": "text/plain" })
      res.end("x")
    })
    await new Promise<void>((resolve) => {
      big.listen(0, "127.0.0.1", () => resolve())
    })
    try {
      const address = big.address()
      if (!address || typeof address === "string") throw new Error("expected TCP address")
      const { files } = service()
      await expect(files.bytes({ kind: "url", url: `http://127.0.0.1:${address.port}/big` })).rejects.toMatchObject({
        code: "ECP_INPUT_INVALID",
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        big.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it("accepts an empty file", async () => {
    const emptyPath = path.join(tempRoot, "empty.bin")
    await writeFile(emptyPath, Buffer.alloc(0))
    const { files } = service()
    const read = await files.bytes({ kind: "file", path: emptyPath })
    expect(read.bytes.byteLength).toBe(0)
  })

  it("overwrites the same artifact name without inventing a second file", async () => {
    const { files } = service()
    const first = await files.writeArtifact(new Uint8Array([1]), { mediaType: "application/octet-stream", name: "dup.bin" })
    const second = await files.writeArtifact(new Uint8Array([2, 2]), {
      mediaType: "application/octet-stream",
      name: "dup.bin",
    })
    expect(second.uri).toBe(first.uri)
    const read = await files.bytes(second)
    expect(read.bytes).toEqual(new Uint8Array([2, 2]))
  })
})