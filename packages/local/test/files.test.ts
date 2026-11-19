import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createPluginFiles, resolveFileRefPath } from "../src/plugins/files.js"

describe("createPluginFiles", () => {
  let tempRoot: string
  let server: http.Server
  let baseUrl: string

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "ecp-files-"))
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

  it("reads file and url refs and writes artifacts", async () => {
    const artifactDir = path.join(tempRoot, "artifacts")
    await mkdir(artifactDir, { recursive: true })
    const filePath = path.join(tempRoot, "local.bin")
    await writeFile(filePath, Buffer.from([9, 8, 7]))
    const files = createPluginFiles({ artifactDir, runId: "run-files" })

    const fromFile = await files.read({ kind: "file", path: filePath, mediaType: "application/octet-stream" })
    expect(fromFile.bytes).toEqual(new Uint8Array([9, 8, 7]))

    const fromUrl = await files.read({ kind: "url", url: baseUrl })
    expect(Buffer.from(fromUrl.bytes).toString("utf8")).toBe("from-url")
    expect(fromUrl.mediaType).toContain("text/plain")

    const written = await files.writeArtifact(fromFile.bytes, {
      mediaType: "application/octet-stream",
      name: "out.bin",
    })
    expect(written).toMatchObject({
      kind: "artifact",
      uri: "ecp://runs/run-files/artifacts/out.bin",
      name: "out.bin",
      sizeBytes: 3,
    })
    expect(await readFile(path.join(artifactDir, "out.bin"))).toEqual(Buffer.from([9, 8, 7]))

    const fromArtifact = await files.read({
      kind: "artifact",
      uri: written.uri,
      name: "out.bin",
      mediaType: "application/octet-stream",
    })
    expect(fromArtifact.bytes).toEqual(new Uint8Array([9, 8, 7]))

    const unnamed = await files.writeArtifact(new Uint8Array([1]), { mediaType: "application/octet-stream" })
    expect(unnamed.name).toMatch(/^artifact-/)
    const byUri = await files.read({ kind: "artifact", uri: unnamed.uri })
    expect(byUri.bytes).toEqual(new Uint8Array([1]))
  })

  it("resolves relative file paths against executionDir", async () => {
    const executionDir = path.join(tempRoot, "exec-dir")
    await mkdir(executionDir, { recursive: true })
    const nested = path.join(executionDir, "subdir")
    await mkdir(nested, { recursive: true })
    const relativeTarget = path.join("subdir", "relative.psd")
    const absoluteTarget = path.join(nested, "relative.psd")
    await writeFile(absoluteTarget, Buffer.from("psd"))
    const absOnly = path.join(tempRoot, "abs-only.psd")
    await writeFile(absOnly, Buffer.from("abs"))
    const files = createPluginFiles({ artifactDir: tempRoot, runId: "run-rel", executionDir })

    const fromRelative = await files.read({ kind: "file", path: relativeTarget })
    expect(Buffer.from(fromRelative.bytes).toString("utf8")).toBe("psd")

    const fromAbsolute = await files.read({ kind: "file", path: absOnly })
    expect(Buffer.from(fromAbsolute.bytes).toString("utf8")).toBe("abs")
  })

  it("rejects relative file paths when executionDir is missing", async () => {
    const files = createPluginFiles({ artifactDir: tempRoot, runId: "run-inline" })
    await expect(files.read({ kind: "file", path: "missing.psd" })).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
    const hostAbs = process.platform === "win32" ? "C:\\data\\host.psd" : "/tmp/host.psd"
    expect(resolveFileRefPath(hostAbs, undefined)).toBe(hostAbs)
  })

  it("fails clearly when a url fetch is not ok", async () => {
    const failing = http.createServer((_req, res) => {
      res.writeHead(500)
      res.end("nope")
    })
    await new Promise<void>((resolve) => {
      failing.listen(0, "127.0.0.1", () => resolve())
    })
    try {
      const address = failing.address()
      if (!address || typeof address === "string") throw new Error("expected TCP address")
      const files = createPluginFiles({ artifactDir: tempRoot, runId: "run-fail" })
      await expect(
        files.read({ kind: "url", url: `http://127.0.0.1:${address.port}/x` }),
      ).rejects.toMatchObject({ code: "ECP_PLUGIN_LOAD_FAILED" })
    } finally {
      await new Promise<void>((resolve, reject) => {
        failing.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
