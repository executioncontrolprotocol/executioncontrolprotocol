import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as localStorage from "@executioncontrolprotocol/local"
import {
  checkHealth,
  createLocalHost,
  generateHostToken,
  HostClient,
  holdEditorSchemaWriteForTests,
  releaseEditorSchemaWriteForTests,
  setEditorSchemaWriteDelayForTests,
} from "../src/index.js"
import { writeEditorSchemaFiles } from "../src/editor-schema.js"
import type { Host } from "@executioncontrolprotocol/engine"

const pluginTestRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../plugins/plugin-test",
)

describe("editor schema async server write", () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    setEditorSchemaWriteDelayForTests(0)
    releaseEditorSchemaWriteForTests()
    while (cleanups.length > 0) await cleanups.pop()?.()
    vi.restoreAllMocks()
  })

  it("marks server ready before a slow editor write finishes", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-editor-async-"))
    holdEditorSchemaWriteForTests()
    const host = await createLocalHost({
      home,
      mode: "server",
      port: 0,
      token: generateHostToken(),
      extraPlugins: [pluginTestRoot],
    })
    cleanups.push(() => host.stop())

    const health = await checkHealth(host.url!)
    expect(health?.status).toBe("ok")

    const rootPath = path.join(home, "schema", "execution.schema.json")
    await expect(access(rootPath)).rejects.toThrow()

    releaseEditorSchemaWriteForTests()
    const write = await host.editorSchemas
    expect(write.ms).toBeGreaterThanOrEqual(0)
    await expect(access(rootPath)).resolves.toBeUndefined()
  })

  it("retrieve plugin over HTTP waits for in-flight editor files", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-editor-retrieve-"))
    holdEditorSchemaWriteForTests()
    const token = generateHostToken()
    const host = await createLocalHost({
      home,
      mode: "server",
      port: 0,
      token,
      extraPlugins: [pluginTestRoot],
    })
    cleanups.push(() => host.stop())

    const client = new HostClient(host.url!, token)
    const responsePromise = client.retrieve({ type: "plugin", limit: 1 })
    releaseEditorSchemaWriteForTests()
    const response = await responsePromise
    expect(response.ok).toBe(true)
    const stamp = JSON.parse(
      await readFile(path.join(home, "schema", "plugins", "index.json"), "utf8"),
    ) as { schemaHash: string }
    expect(stamp.schemaHash).toBe(host.schemaHash)
  })

  it("leaves no stamp when a write fails mid-way and redoes on next start", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-editor-fail-"))
    const seed = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    await seed.stop()
    await rm(path.join(home, "schema", "plugins", "index.json"))

    const original = localStorage.atomicWriteText
    vi.spyOn(localStorage, "atomicWriteText").mockImplementation(async (targetPath, text) => {
      if (targetPath.endsWith("index.json")) {
        throw new Error("simulated stamp failure")
      }
      return original(targetPath, text)
    })

    const broken = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    await broken.editorSchemas
    await broken.stop()
    await expect(access(path.join(home, "schema", "plugins", "index.json"))).rejects.toThrow()

    vi.restoreAllMocks()
    const fixed = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    cleanups.push(() => fixed.stop())
    await fixed.editorSchemas
    const stamp = JSON.parse(
      await readFile(path.join(home, "schema", "plugins", "index.json"), "utf8"),
    ) as { schemaHash: string }
    expect(stamp.schemaHash).toBe(fixed.schemaHash)
  })
})

describe("writeEditorSchemaFiles", () => {
  it("exposes ms timing on the write result", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-editor-ms-"))
    const host = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    const result = await writeEditorSchemaFiles(host as Host)
    expect(result.ms).toBeGreaterThanOrEqual(0)
    await host.stop()
  })
})