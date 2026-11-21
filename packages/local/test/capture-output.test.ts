import { createServer } from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ArtifactStore, DEFAULT_FILE_MAX_BYTES_SETTINGS, ScratchSpace } from "@executioncontrolprotocol/protocol"
import { MemoryArtifactStore, MemoryScratchSpace } from "@executioncontrolprotocol/engine/testing"
import type { ServiceLookup } from "@executioncontrolprotocol/engine"
import { createCaptureOneDelegate } from "../src/plugins/capture-output.js"

function lookup(artifacts: MemoryArtifactStore, scratch: MemoryScratchSpace): ServiceLookup {
  return {
    get(token) {
      if (token === ArtifactStore) return artifacts as never
      if (token === ScratchSpace) return scratch as never
      throw new Error(`unexpected ${token.id}`)
    },
    getAll: () => [],
    has: (token) => token === ArtifactStore || token === ScratchSpace,
  }
}

let urlBase = ""
let urlServer: ReturnType<typeof createServer> | undefined

beforeAll(async () => {
  urlServer = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "image/png" })
    res.end(Buffer.from([1, 2, 3]))
  })
  await new Promise<void>((resolve) => urlServer!.listen(0, "127.0.0.1", () => resolve()))
  const address = urlServer.address()
  if (!address || typeof address === "string") throw new Error("listen failed")
  urlBase = `http://127.0.0.1:${address.port}/x.png`
})

afterAll(async () => {
  await new Promise<void>((resolve) => urlServer?.close(() => resolve()))
})

describe("createCaptureOneDelegate", () => {
  it("sets archive on artifact refs without copying", async () => {
    const artifacts = new MemoryArtifactStore()
    const scratch = new MemoryScratchSpace()
    const runId = "run-cap-delegate"
    const ref = {
      kind: "artifact" as const,
      uri: artifacts.uri(runId, "in.png"),
      name: "in.png",
      mediaType: "image/png",
    }
    const delegate = createCaptureOneDelegate(lookup(artifacts, scratch), DEFAULT_FILE_MAX_BYTES_SETTINGS)
    const { record } = await delegate({
      runId,
      stepId: "s",
      outputPath: "out",
      ref,
      artifactName: "unused",
    })
    expect(record.artifact?.name).toBe("in.png")
    expect(ref.archive?.name).toBe("in.png")
  })

  it("copies file bytes into a named artifact", async () => {
    const artifacts = new MemoryArtifactStore()
    const scratch = new MemoryScratchSpace()
    const { writeFile } = await import("node:fs/promises")
    const { mkdtemp } = await import("node:fs/promises")
    const os = await import("node:os")
    const path = await import("node:path")
    const dir = await mkdtemp(path.join(os.tmpdir(), "ecp-cap-copy-"))
    const file = path.join(dir, "in.bin")
    await writeFile(file, Buffer.from([4, 5]))
    const ref = { kind: "file" as const, path: file }
    const delegate = createCaptureOneDelegate(lookup(artifacts, scratch), DEFAULT_FILE_MAX_BYTES_SETTINGS)
    const runId = "run-copy"
    const { record } = await delegate({
      runId,
      stepId: "s",
      outputPath: "out",
      ref,
      artifactName: "out.bin",
    })
    expect(record.artifact?.name).toBe("out.bin")
    expect(await artifacts.getBytes(runId, "out.bin")).toEqual(new Uint8Array([4, 5]))
  })

  it("resolves relative file paths with executionDir", async () => {
    const artifacts = new MemoryArtifactStore()
    const scratch = new MemoryScratchSpace()
    const { writeFile, mkdtemp } = await import("node:fs/promises")
    const os = await import("node:os")
    const path = await import("node:path")
    const execDir = await mkdtemp(path.join(os.tmpdir(), "ecp-cap-exec-"))
    await writeFile(path.join(execDir, "rel.bin"), Buffer.from([2]))
    const ref = { kind: "file" as const, path: "rel.bin" }
    const delegate = createCaptureOneDelegate(lookup(artifacts, scratch), DEFAULT_FILE_MAX_BYTES_SETTINGS)
    const runId = "run-rel"
    const { record } = await delegate({
      runId,
      stepId: "s",
      outputPath: "f",
      ref,
      artifactName: "cap.bin",
      executionDir: execDir,
    })
    expect(record.error).toBeUndefined()
    expect(record.artifact?.name).toBe("cap.bin")
  })

  it("captures url refs into the artifact store", async () => {
    const artifacts = new MemoryArtifactStore()
    const scratch = new MemoryScratchSpace()
    const ref = { kind: "url" as const, url: urlBase, mediaType: "image/png" }
    const delegate = createCaptureOneDelegate(lookup(artifacts, scratch), DEFAULT_FILE_MAX_BYTES_SETTINGS)
    const runId = "run-url-cap"
    const { record } = await delegate({
      runId,
      stepId: "s",
      outputPath: "u",
      ref,
      artifactName: "from-url.png",
    })
    expect(record.error).toBeUndefined()
    expect(ref.archive?.name).toBe("from-url.png")
    expect(await artifacts.getBytes(runId, "from-url.png")).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("returns error record on failure", async () => {
    const artifacts = new MemoryArtifactStore()
    const scratch = new MemoryScratchSpace()
    const delegate = createCaptureOneDelegate(lookup(artifacts, scratch), {
      ...DEFAULT_FILE_MAX_BYTES_SETTINGS,
      capture: 1,
    })
    const ref = { kind: "file" as const, path: "/does/not/exist.bin" }
    const { record } = await delegate({
      runId: "run-fail",
      stepId: "s",
      outputPath: "f",
      ref,
      artifactName: "out.bin",
    })
    expect(record.error?.code).toBeDefined()
    expect(ref.archive).toBeUndefined()
  })
})