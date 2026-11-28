import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { createEnvironment } from "@executioncontrolprotocol/engine"
import { LocalEditorSchemaFiles } from "../src/editor-schema-files.js"

describe("LocalEditorSchemaFiles", () => {
  it("requires options.writeRef", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-editor-schema-files-"))
    const host = await createEnvironment().start({ home })
    expect(
      () =>
        new LocalEditorSchemaFiles({
          settings: { home },
          options: {},
        } as never),
    ).toThrow(/writeRef/)
    await host.stop()
  })

  it("reads schema files after ensureCurrent", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-editor-schema-files-"))
    const schemaDir = path.join(home, "schema")
    const pluginsDir = path.join(schemaDir, "plugins")
    await mkdir(pluginsDir, { recursive: true })
    await writeFile(path.join(schemaDir, "execution.schema.json"), "{}")
    await writeFile(path.join(pluginsDir, "_40executioncontrolprotocol_2ftest.editor.schema.json"), "{\"ok\":true}")
    const files = new LocalEditorSchemaFiles({
      settings: { home },
      options: { writeRef: { promise: Promise.resolve({ wrote: false, files: [] }) } },
    } as never)
    await files.ensureCurrent()
    const root = await files.stat()
    expect(root.bytes).toBe(2)
    const plugin = await files.stat("@executioncontrolprotocol/test")
    expect(await files.read(plugin.path)).toEqual({ ok: true })
  })
})