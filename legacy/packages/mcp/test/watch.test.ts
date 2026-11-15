import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { watchPluginManifest } from "../src/watch.js"

describe("watchPluginManifest", () => {
  const closes: Array<() => void> = []

  afterEach(() => {
    for (const close of closes) close()
    closes.length = 0
  })

  it("invokes onChange after package.json is written", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-mcp-watch-"))
    const onChange = vi.fn()
    const watcher = watchPluginManifest(dir, onChange)
    closes.push(watcher.close)
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "ecp-plugins" }), "utf8")
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    }, { timeout: 5_000 })
  })

  it("creates a missing dataDir so the first install is observed", async () => {
    const parent = await mkdtemp(join(tmpdir(), "ecp-mcp-watch-parent-"))
    const dir = join(parent, "nested-data")
    const onChange = vi.fn()
    const watcher = watchPluginManifest(dir, onChange)
    closes.push(watcher.close)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "package.json"), "{}", "utf8")
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    }, { timeout: 5_000 })
  })
})
