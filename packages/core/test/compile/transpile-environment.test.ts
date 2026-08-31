import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  bundleEnvironmentSource,
  bundleWorkflowSource,
} from "../../src/compile/transpile.js"

async function writeStubPackage(project: string, name: string): Promise<void> {
  const pkgDir = join(project, "node_modules", name)
  await mkdir(pkgDir, { recursive: true })
  await writeFile(
    join(pkgDir, "package.json"),
    JSON.stringify({ name, version: "1.0.0", main: "index.js" }),
    "utf8"
  )
  await writeFile(join(pkgDir, "index.js"), "module.exports = { stub: true }\n", "utf8")
}

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
      await writeStubPackage(dir, "sharp")
      const source = `
        import sharp from "sharp"
        export default { sharp: typeof sharp }
      `
      const code = await bundleEnvironmentSource(source, join(dir, "environment.ts"), dir)
      expect(code).toMatch(/file:\/\/\/?.*sharp/)
      expect(code).not.toMatch(/stub:\s*true/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("rejects unresolved packages for both environment and workflow bundles", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-wf-bundle-"))
    try {
      await writeFile(join(dir, "package.json"), JSON.stringify({ name: "fixture-wf", type: "module" }))
      const source = `import x from "ecp-missing-native-dep"\nexport default x`
      await expect(bundleEnvironmentSource(source, join(dir, "environment.ts"), dir)).rejects.toThrow(
        /Could not resolve ["']ecp-missing-native-dep["']/
      )
      await expect(bundleWorkflowSource(source, join(dir, "workflow.ts"), dir)).rejects.toThrow(
        /Could not resolve ["']ecp-missing-native-dep["']/
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
