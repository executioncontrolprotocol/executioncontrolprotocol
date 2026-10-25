import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  FILE_ARTIFACT_URI_PREFIX,
  MediaStore,
  createCapabilityBlobStore,
  stashCapabilityBlob,
} from "@executioncontrolprotocol/core"
import { FILE_REF_KINDS } from "@executioncontrolprotocol/core/types"
import {
  assertRelativeArtifactKey,
  createDiskMediaStore,
  environment,
  NODE_ENVIRONMENT_ID,
} from "../src/index.js"

describe("createDiskMediaStore", () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function tmpRoot(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "ecp-media-"))
    dirs.push(dir)
    return dir
  }

  it("writes and reads ecp://file artifacts under the root", async () => {
    const root = await tmpRoot()
    const store = createDiskMediaStore({ root })
    const bytes = new Uint8Array([1, 2, 3, 4])
    const ref = await store.write(
      bytes,
      { mediaType: "image/png", name: "out.png", prefix: "artifacts/images" },
      {}
    )
    expect(ref.kind).toBe(FILE_REF_KINDS.ARTIFACT)
    if (ref.kind !== FILE_REF_KINDS.ARTIFACT) throw new Error("expected artifact")
    expect(ref.uri).toBe(`${FILE_ARTIFACT_URI_PREFIX}artifacts/images/out.png`)
    const onDisk = await readFile(join(root, "artifacts", "images", "out.png"))
    expect([...onDisk]).toEqual([1, 2, 3, 4])
    const resolved = await store.read(ref, {})
    expect([...resolved.bytes]).toEqual([1, 2, 3, 4])
    expect(resolved.mediaType).toBe("image/png")
  })

  it("reads kind:file paths from disk", async () => {
    const root = await tmpRoot()
    const file = join(root, "source.jpg")
    await writeFile(file, Buffer.from([9, 8, 7]))
    const store = createDiskMediaStore({ root })
    const resolved = await store.read(
      { kind: FILE_REF_KINDS.FILE, path: file, mediaType: "image/jpeg" },
      {}
    )
    expect([...resolved.bytes]).toEqual([9, 8, 7])
    expect(resolved.mediaType).toBe("image/jpeg")
  })

  it("resolves ecp://browser locators from ctx.blobs", async () => {
    const blobs = createCapabilityBlobStore()
    const locator = stashCapabilityBlob(blobs, {
      name: "in.bin",
      type: "application/octet-stream",
      size: 2,
      arrayBuffer: async () => new Uint8Array([4, 5]).buffer,
    })
    const store = createDiskMediaStore({ root: await tmpRoot() })
    const resolved = await store.read({ kind: FILE_REF_KINDS.FILE, path: locator }, { blobs })
    expect([...resolved.bytes]).toEqual([4, 5])
  })

  it("rejects relative keys that escape the root", () => {
    expect(() => assertRelativeArtifactKey("../secret")).toThrow(/relative path/)
    expect(() => assertRelativeArtifactKey("/abs")).toThrow(/relative path/)
    expect(() => assertRelativeArtifactKey("C:\\windows")).toThrow(/relative path/)
    expect(() => assertRelativeArtifactKey("a/../../b")).toThrow(/relative path/)
    expect(() => assertRelativeArtifactKey("")).toThrow(/empty/)
    expect(() => assertRelativeArtifactKey("a\0b")).toThrow(/NUL/)
  })

  it("uses ECP_ARTIFACTS_DIR when root is omitted", async () => {
    const root = await tmpRoot()
    const previous = process.env.ECP_ARTIFACTS_DIR
    process.env.ECP_ARTIFACTS_DIR = root
    try {
      const store = createDiskMediaStore()
      const ref = await store.write(
        new Uint8Array([5]),
        { mediaType: "text/plain", name: "a.txt", prefix: "p" },
        {}
      )
      if (ref.kind !== FILE_REF_KINDS.ARTIFACT) throw new Error("expected artifact")
      expect(ref.uri).toBe(`${FILE_ARTIFACT_URI_PREFIX}p/a.txt`)
      const onDisk = await readFile(join(root, "p", "a.txt"))
      expect([...onDisk]).toEqual([5])
    } finally {
      if (previous === undefined) delete process.env.ECP_ARTIFACTS_DIR
      else process.env.ECP_ARTIFACTS_DIR = previous
    }
  })

  it("binds a disk MediaStore on environment()", () => {
    const env = environment(NODE_ENVIRONMENT_ID, "media-bind")
    expect(env.get(MediaStore)?.service).toBe(MediaStore.id)
  })

  it("rejects missing disk files", async () => {
    const store = createDiskMediaStore({ root: await tmpRoot() })
    await expect(
      store.read({ kind: FILE_REF_KINDS.FILE, path: join(tmpdir(), "ecp-missing-media.bin") }, {})
    ).rejects.toThrow()
  })
})
