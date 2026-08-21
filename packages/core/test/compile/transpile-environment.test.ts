import { describe, expect, it } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  bundleEnvironmentSource,
  bundleWorkflowSource,
} from "../../src/compile/transpile.js"

describe("bundleEnvironmentSource", () => {
  it("keeps package imports external (native deps stay at runtime)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-env-bundle-"))
    try {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "fixture-env",
          type: "module",
        })
      )
      const source = `
        import sharp from "sharp"
        export default { sharp: typeof sharp }
      `
      const code = await bundleEnvironmentSource(source, join(dir, "environment.ts"), dir)
      expect(code).toMatch(/from\s+["']sharp["']/)
      expect(code).not.toMatch(/node_modules[\\/]+sharp/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("rejects workflow bundling of unresolved packages while env stays external", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-wf-bundle-"))
    try {
      await writeFile(join(dir, "package.json"), JSON.stringify({ name: "fixture-wf", type: "module" }))
      const source = `import x from "ecp-missing-native-dep"\nexport default x`
      const envCode = await bundleEnvironmentSource(source, join(dir, "environment.ts"), dir)
      expect(envCode).toMatch(/ecp-missing-native-dep/)
      await expect(bundleWorkflowSource(source, join(dir, "workflow.ts"), dir)).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
