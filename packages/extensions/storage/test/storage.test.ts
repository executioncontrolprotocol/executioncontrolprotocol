import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { globalRegistry } from "@executioncontrolprotocol/core"
import {
  registerStorageExtension,
  storageExtension,
  ensureEcpHomeLayout,
  wipeEcpTemp,
  resolveSafeStoragePath,
  parseStorageKey,
  storageUri,
  handleStorageWrite,
  handleStorageRead,
  handleWorkflowSave,
  handleWorkflowList,
  handleWorkflowLoad,
  handleWorkflowDelete,
} from "../src/index.js"

describe("@executioncontrolprotocol/storage", () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "ecp-storage-"))
    await registerStorageExtension()
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  function ctx() {
    return {
      extensionConfig: { home },
      usage: { increment: () => undefined },
    }
  }

  it("registers the disk-backed extension", async () => {
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/storage")
    expect(ext).toBe(storageExtension)
    const write = ext?.capabilities.find((c) => c.id === "@executioncontrolprotocol/storage.write")
    expect(write?.execution).toBe("host")
  })

  it("positive: write/read round-trip on temp tier", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const written = await handleStorageWrite(
      {
        key: "media/a.bin",
        value: Buffer.from(bytes).toString("base64"),
        encoding: "base64",
        tier: "temp",
        mediaType: "application/octet-stream",
        name: "a.bin",
      },
      ctx()
    )
    expect(written).toMatchObject({
      ok: true,
      tier: "temp",
      uri: "ecp://storage/temp/media/a.bin",
    })
    const read = (await handleStorageRead({ key: "temp/media/a.bin" }, ctx())) as {
      value?: Uint8Array
      mediaType?: string
      name?: string
    }
    expect(read.mediaType).toBe("application/octet-stream")
    expect(read.name).toBe("a.bin")
    expect([...(read.value as Uint8Array)]).toEqual([1, 2, 3, 4])
    await access(join(home, "temp", "media", "a.bin"))
  })

  it("positive: durable tier lands under artifacts/", async () => {
    await handleStorageWrite(
      {
        key: "keep/x.png",
        value: Buffer.from([9]).toString("base64"),
        encoding: "base64",
        tier: "durable",
      },
      ctx()
    )
    await access(join(home, "artifacts", "keep", "x.png"))
    await expect(access(join(home, "temp", "keep", "x.png"))).rejects.toThrow()
  })

  it("positive: JSON values round-trip", async () => {
    await handleStorageWrite({ key: "state", value: { n: 42 }, tier: "temp" }, ctx())
    const read = (await handleStorageRead({ key: "state", tier: "temp" }, ctx())) as {
      value?: { n: number }
    }
    expect(read.value).toEqual({ n: 42 })
  })

  it("negative: path traversal rejected", () => {
    expect(() => resolveSafeStoragePath(join(home, "temp"), "../escape")).toThrow(/\.\./)
    expect(() => resolveSafeStoragePath(join(home, "temp"), "/abs")).toThrow(/relative/)
  })

  it("negative: missing key returns empty read", async () => {
    const read = await handleStorageRead({ key: "missing", tier: "temp" }, ctx())
    expect(read).toEqual({})
  })

  it("edge: wipeEcpTemp clears temp but leaves durable", async () => {
    await ensureEcpHomeLayout(home)
    await writeFile(join(home, "temp", "scratch.bin"), Buffer.from([1]))
    await writeFile(join(home, "artifacts", "keep.bin"), Buffer.from([2]))
    await wipeEcpTemp(home)
    await expect(access(join(home, "temp", "scratch.bin"))).rejects.toThrow()
    const kept = await readFile(join(home, "artifacts", "keep.bin"))
    expect([...kept]).toEqual([2])
    await access(join(home, "temp"))
    await access(join(home, "workflows"))
  })

  it("edge: parseStorageKey and storageUri align", () => {
    expect(storageUri("temp", "a/b.png")).toBe("ecp://storage/temp/a/b.png")
    expect(storageUri("durable", "a/b.png")).toBe("ecp://storage/artifacts/a/b.png")
    expect(parseStorageKey("ecp://storage/temp/a/b.png")).toEqual({
      tier: "temp",
      key: "a/b.png",
    })
    expect(parseStorageKey("ecp://storage/artifacts/a/b.png")).toEqual({
      tier: "durable",
      key: "a/b.png",
    })
    expect(parseStorageKey("plain", "durable")).toEqual({ tier: "durable", key: "plain" })
  })

  it("positive: workflow save/list/load/delete round-trip (Fluent)", async () => {
    const fluent = 'export default workflow("My flow")'
    const saved = await handleWorkflowSave(
      { id: "my-flow", label: "My flow", fluent },
      ctx()
    )
    expect(saved).toMatchObject({ ok: true, id: "my-flow" })
    await access(join(home, "workflows", "my-flow.workflow.ts"))

    const listed = (await handleWorkflowList({}, ctx())) as {
      workflows: Array<{ id: string; label: string }>
    }
    expect(listed.workflows.some((w) => w.id === "my-flow" && w.label === "My flow")).toBe(true)

    const loaded = (await handleWorkflowLoad({ id: "my-flow" }, ctx())) as {
      fluent?: string
      label?: string
      id?: string
    }
    expect(loaded.id).toBe("my-flow")
    expect(loaded.label).toBe("My flow")
    expect(loaded.fluent).toContain("My flow")

    const deleted = await handleWorkflowDelete({ id: "my-flow" }, ctx())
    expect(deleted).toEqual({ ok: true, deleted: true })
    await expect(access(join(home, "workflows", "my-flow.workflow.ts"))).rejects.toThrow()
  })

  it("positive: load unwraps legacy dual-bundle JSON", async () => {
    await ensureEcpHomeLayout(home)
    const bundle = {
      schema: "@executioncontrolprotocol.workflow.bundle",
      version: "1.0",
      id: "legacy-flow",
      label: "Legacy",
      updatedAt: "2026-01-01T00:00:00.000Z",
      fluent: 'export default workflow("Legacy")',
      manifest: {
        schema: "@executioncontrolprotocol.workflow",
        version: "1.0",
        workflow: { id: "legacy-flow", label: "Legacy" },
        steps: [],
      },
    }
    await writeFile(join(home, "workflows", "legacy-flow.json"), JSON.stringify(bundle), "utf8")
    await writeFile(
      join(home, "workflows", "legacy-flow.json.meta.json"),
      JSON.stringify({ encoding: "json" }),
      "utf8"
    )

    const listed = (await handleWorkflowList({}, ctx())) as {
      workflows: Array<{ id: string; label: string }>
    }
    expect(listed.workflows.some((w) => w.id === "legacy-flow")).toBe(true)

    const loaded = (await handleWorkflowLoad({ id: "legacy-flow" }, ctx())) as {
      fluent?: string
      label?: string
    }
    expect(loaded.label).toBe("Legacy")
    expect(loaded.fluent).toContain("Legacy")
  })

  it("edge: Fluent save replaces legacy JSON for same id", async () => {
    await ensureEcpHomeLayout(home)
    await writeFile(
      join(home, "workflows", "dup.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.workflow.bundle",
        version: "1.0",
        id: "dup",
        label: "Old",
        updatedAt: "2026-01-01T00:00:00.000Z",
        fluent: "old",
        manifest: { schema: "@executioncontrolprotocol.workflow" },
      }),
      "utf8"
    )
    await handleWorkflowSave({ id: "dup", label: "New", fluent: "new fluent" }, ctx())
    await access(join(home, "workflows", "dup.workflow.ts"))
    await expect(access(join(home, "workflows", "dup.json"))).rejects.toThrow()
    const listed = (await handleWorkflowList({}, ctx())) as {
      workflows: Array<{ id: string; label: string }>
    }
    expect(listed.workflows.filter((w) => w.id === "dup")).toHaveLength(1)
    expect(listed.workflows.find((w) => w.id === "dup")?.label).toBe("New")
  })

  it("negative: workflow id path traversal rejected", async () => {
    await expect(
      handleWorkflowSave({ id: "../escape", label: "Bad", fluent: "" }, ctx())
    ).rejects.toThrow(/path/)
  })

  it("edge: wipeEcpTemp leaves workflows intact", async () => {
    await ensureEcpHomeLayout(home)
    await writeFile(join(home, "workflows", "keep.workflow.ts"), "export default workflow()")
    await writeFile(join(home, "temp", "scratch.bin"), Buffer.from([1]))
    await wipeEcpTemp(home)
    const kept = await readFile(join(home, "workflows", "keep.workflow.ts"), "utf8")
    expect(kept).toContain("workflow")
    await expect(access(join(home, "temp", "scratch.bin"))).rejects.toThrow()
  })
})
