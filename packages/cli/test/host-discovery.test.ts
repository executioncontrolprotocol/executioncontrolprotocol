import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { discoverOps } from "../src/lib/host-discovery.js"

const pluginTestRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../plugins/plugin-test",
)

describe("host discovery", () => {
  it("falls back to in-process and closes cleanly", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "ecp-cli-discover-"))
    try {
      const ops = await discoverOps({
        home,
        extraPlugins: [pluginTestRoot],
      })
      expect(ops.mode).toBe("in-process")
      const result = await ops.retrieve({ type: "capability", query: "echo", limit: 5 })
      expect(result.ok).toBe(true)
      await ops.close()
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 60_000)
})
