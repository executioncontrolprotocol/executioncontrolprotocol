import { describe, expect, it } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { scaffoldPlugin } from "../src/build/scaffold-plugin.js"

describe("scaffoldPlugin", () => {
  it("writes src/index.ts and a minimal package.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-scaffold-"))
    try {
      await scaffoldPlugin(dir, "demo")
      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
        name: string
        scripts: { build: string }
      }
      expect(pkg.name).toBe("@executioncontrolprotocol/plugin-demo")
      expect(pkg.scripts.build).toContain("ecp plugins build")
      const source = await readFile(join(dir, "src", "index.ts"), "utf8")
      expect(source).toMatch(/defineExtension/)
      expect(source).toMatch(/export default/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
