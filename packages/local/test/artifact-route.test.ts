import { describe, expect, it } from "vitest"
import { MemoryArtifactStore } from "@executioncontrolprotocol/engine/testing"
import { readRunArtifactForHttp } from "../src/http/artifact-response.js"

describe("readRunArtifactForHttp", () => {
  it("streams a stored artifact", async () => {
    const store = new MemoryArtifactStore()
    await store.put("run-art", "ok.png", new Uint8Array([1, 2, 3]), { mediaType: "image/png" })
    const result = await readRunArtifactForHttp(store, "run-art", "ok.png")
    expect("body" in result).toBe(true)
    if ("body" in result) {
      expect(result.mediaType).toBe("image/png")
      const bytes = await new Response(result.body).arrayBuffer()
      expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3]))
    }
  })

  it("rejects unknown names and traversal", async () => {
    const store = new MemoryArtifactStore()
    await expect(readRunArtifactForHttp(store, "run-art", "missing.bin")).resolves.toMatchObject({
      code: "ECP_NOT_FOUND",
    })
    await expect(readRunArtifactForHttp(store, "run-art", "..")).resolves.toMatchObject({ code: "ECP_NOT_FOUND" })
    await expect(readRunArtifactForHttp(store, "run-art", "a/b")).resolves.toMatchObject({ code: "ECP_NOT_FOUND" })
  })

  it("rejects invalid run ids and uses octet-stream when media type is absent", async () => {
    const store = new MemoryArtifactStore()
    await store.put("run-art", "plain.bin", new Uint8Array([5]))
    const result = await readRunArtifactForHttp(store, "run-art", "plain.bin")
    expect("body" in result).toBe(true)
    if ("body" in result) expect(result.mediaType).toBe("application/octet-stream")
    await expect(readRunArtifactForHttp(store, "../escape", "ok.png")).resolves.toMatchObject({
      code: "ECP_NOT_FOUND",
    })
  })
})