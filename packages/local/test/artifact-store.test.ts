import { mkdir, mkdtemp, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { createEnvironment } from "@executioncontrolprotocol/engine"
import { ArtifactStore } from "@executioncontrolprotocol/protocol"
import { LocalArtifactStore } from "../src/storage/artifact-store.js"

describe("LocalArtifactStore", () => {
  let home: string

  afterAll(async () => {
    // temp cleaned by OS
  })

  it("puts bytes atomically and lists artifacts", async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "ecp-artifact-store-"))
    const host = await createEnvironment().use(LocalArtifactStore, ArtifactStore).start({ home })
    const store = host.services.get(ArtifactStore)
    const ref = await store.put("run-a", "one.bin", new Uint8Array([5, 4]), { mediaType: "application/octet-stream" })
    expect(ref.uri).toBe("ecp://runs/run-a/artifacts/one.bin")
    const listed = await store.list("run-a")
    expect(listed).toEqual([{ name: "one.bin", sizeBytes: 2 }])
    const onDisk = path.join(home, "runs", "run-a", "artifacts", "one.bin")
    await mkdir(path.dirname(onDisk), { recursive: true })
    expect(await readFile(onDisk)).toEqual(Buffer.from([5, 4]))
    const fromStream = await store.put(
      "run-a",
      "two.bin",
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([7]))
          controller.close()
        },
      }),
    )
    expect(fromStream.sizeBytes).toBe(1)
    const streamed = await store.getStream("run-a", "two.bin")
    const reader = streamed.getReader()
    const part = await reader.read()
    expect(part.value).toEqual(new Uint8Array([7]))

    await store.deleteRun("run-a")
    expect(await store.list("run-a")).toEqual([])
    await host.stop()
  })
})