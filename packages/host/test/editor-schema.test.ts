import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalPluginRegistration } from "@executioncontrolprotocol/local"
import { safePluginId } from "@executioncontrolprotocol/engine"
import { createLocalHost } from "../src/index.js"

const pluginTestRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../plugins/plugin-test",
)

describe("editor schema files", () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
    vi.restoreAllMocks()
  })

  it("writes a small root with relative $refs and per-plugin editor files", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-editor-schema-"))
    const host = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    cleanups.push(() => host.stop())

    const rootPath = path.join(home, "schema", "execution.schema.json")
    const root = JSON.parse(await readFile(rootPath, "utf8")) as {
      $defs: { step: { allOf: Array<{ then: { properties: { input: { $ref: string } } } }> } }
    }
    const refs = root.$defs.step.allOf.map((branch) => branch.then.properties.input.$ref)
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) {
      expect(ref.startsWith("plugins/")).toBe(true)
      expect(ref).toContain(".editor.schema.json#/$defs/")
      expect(ref).toContain(".editorInput")
    }
    // Root must not inline wrapValue blobs on step inputs (relative $ref only).
    expect(JSON.stringify(root.$defs.step.allOf)).not.toMatch(/"required":\["\$secret"\]/)

    const safe = safePluginId("@executioncontrolprotocol/test")
    const pluginPath = path.join(home, "schema", "plugins", `${safe}.editor.schema.json`)
    const plugin = JSON.parse(await readFile(pluginPath, "utf8")) as { $defs: Record<string, unknown> }
    expect(plugin.$defs["echo.editorInput"]).toBeTruthy()
    expect(plugin.$defs["echo.returns"]).toBeTruthy()

    const index = JSON.parse(await readFile(path.join(home, "schema", "plugins", "index.json"), "utf8")) as {
      schemaHash: string
      plugins: Record<string, string>
    }
    expect(index.schemaHash).toBe(host.schemaHash)
    expect(index.plugins["@executioncontrolprotocol/test"]).toMatch(/^[a-f0-9]{64}$/)
  })

  it("resolves every $ref the way an editor would and removes old-style file names", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-editor-refs-"))
    const pluginsDir = path.join(home, "schema", "plugins")
    await mkdir(pluginsDir, { recursive: true })
    const legacy = path.join(pluginsDir, "%40executioncontrolprotocol%2Ftest.editor.schema.json")
    await writeFile(legacy, "{}\n")

    const host = await createLocalHost({ home, mode: "in-process", extraPlugins: [pluginTestRoot] })
    cleanups.push(() => host.stop())

    // Follow every $ref the way an editor does (URL relative to the containing file, then
    // URL-decoded to a path) and check both the file and its #/$defs/<name> target exist.
    const rootPath = path.join(home, "schema", "execution.schema.json")
    const pending = [rootPath]
    const seen = new Set<string>()
    let followed = 0
    while (pending.length > 0) {
      const file = pending.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      const document = JSON.parse(await readFile(file, "utf8")) as { $id?: string; $defs?: Record<string, unknown> }
      expect(document.$id, `${file} must not set $id`).toBeUndefined()
      const refs = new Set<string>()
      JSON.stringify(document, (key, value: unknown) => {
        if (key === "$ref" && typeof value === "string") refs.add(value)
        return value
      })
      for (const ref of refs) {
        const [target = "", fragment = ""] = ref.split("#")
        const targetPath = target ? fileURLToPath(new URL(target, pathToFileURL(file))) : file
        const targetDoc = JSON.parse(await readFile(targetPath, "utf8")) as { $defs?: Record<string, unknown> }
        const defName = decodeURIComponent(fragment.replace(/^\/\$defs\//, ""))
        if (fragment.startsWith("/$defs/")) expect(targetDoc.$defs?.[defName], `${ref} in ${file}`).toBeTruthy()
        if (target) pending.push(targetPath)
        followed += 1
      }
    }
    expect(seen.size).toBeGreaterThan(1)
    expect(followed).toBeGreaterThan(0)
    await expect(stat(legacy)).rejects.toThrow()
  })

  it("does not call loadPluginSchema on a warm start with no plugin changes", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-editor-warm-"))
    const spy = vi.spyOn(LocalPluginRegistration.prototype, "loadPluginSchema")

    const first = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    expect(spy.mock.calls.length).toBeGreaterThan(0)
    const rootBefore = await readFile(path.join(home, "schema", "execution.schema.json"), "utf8")
    const rootStatBefore = await stat(path.join(home, "schema", "execution.schema.json"))
    await first.stop()

    spy.mockClear()
    const second = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    cleanups.push(() => second.stop())
    expect(spy).toHaveBeenCalledTimes(0)
    const rootAfter = await readFile(path.join(home, "schema", "execution.schema.json"), "utf8")
    const rootStatAfter = await stat(path.join(home, "schema", "execution.schema.json"))
    expect(rootAfter).toBe(rootBefore)
    expect(rootStatAfter.mtimeMs).toBe(rootStatBefore.mtimeMs)
  })
})
