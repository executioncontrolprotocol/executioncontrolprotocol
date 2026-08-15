import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { compileWorkflowSource } from "../../src/compile/index.js"
import { resolveBundleDir } from "../../src/compile/transpile.js"
import { registerTestExtension } from "../../src/testing/test-extension.js"

const SAMPLE_TS = `
import { workflow, step } from "@executioncontrolprotocol/core"
export default workflow("Consumer resolve")
  .run([step("@executioncontrolprotocol/test.echo", "E").with({ value: 1 }).as("out")])
`

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..")

async function linkPkg(projectRoot: string, name: string, target: string): Promise<void> {
  const scopeDir = join(projectRoot, "node_modules", "@executioncontrolprotocol")
  await mkdir(scopeDir, { recursive: true })
  const linkPath = join(scopeDir, name)
  await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir")
}

describe("resolveBundleDir", () => {
  it("uses dirname for absolute paths and cwd otherwise", () => {
    const abs = join(tmpdir(), "proj", "src", "workflow.ts")
    expect(resolveBundleDir(abs)).toBe(dirname(abs))
    expect(resolveBundleDir("workflow.ts")).toBe(process.cwd())
  })
})

describe("compileWorkflowSource consumer resolution", () => {
  const temps: string[] = []

  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it("resolves @executioncontrolprotocol/core from the project node_modules via absolute filename", async () => {
    await registerTestExtension()
    const project = await mkdtemp(join(tmpdir(), "ecp-consumer-ok-"))
    temps.push(project)
    const nested = join(project, "nested", "deep")
    await mkdir(nested, { recursive: true })
    await linkPkg(project, "core", join(repoRoot, "packages/core"))
    await linkPkg(project, "types", join(repoRoot, "packages/types"))

    const filename = join(nested, "workflow.ts")
    await writeFile(filename, SAMPLE_TS, "utf8")

    const result = await compileWorkflowSource({ source: SAMPLE_TS, filename })
    expect(result.ok).toBe(true)
    expect(result.manifest?.steps[0]?.as).toBe("out")
  })

  it("fails when the package is missing from the consumer project (not monorepo dist paths)", async () => {
    const project = await mkdtemp(join(tmpdir(), "ecp-consumer-miss-"))
    temps.push(project)
    const nested = join(project, "src")
    await mkdir(nested, { recursive: true })
    const filename = join(nested, "workflow.ts")
    await writeFile(filename, SAMPLE_TS, "utf8")

    const result = await compileWorkflowSource({ source: SAMPLE_TS, filename })
    expect(result.ok).toBe(false)
    const message = result.compileErrors?.[0]?.message ?? ""
    expect(message).toMatch(/Could not resolve|Cannot find module|failed to resolve/i)
    expect(message).not.toMatch(/packages[/\\]core[/\\]dist/)
  })

  it("resolves from a nested absolute path even when cwd is elsewhere", async () => {
    await registerTestExtension()
    const project = await mkdtemp(join(tmpdir(), "ecp-consumer-nested-"))
    temps.push(project)
    const nested = join(project, "apps", "bot", "workflows")
    await mkdir(nested, { recursive: true })
    await linkPkg(project, "core", join(repoRoot, "packages/core"))
    await linkPkg(project, "types", join(repoRoot, "packages/types"))

    const filename = join(nested, "workflow.ts")
    await writeFile(filename, SAMPLE_TS, "utf8")

    const prevCwd = process.cwd()
    try {
      process.chdir(tmpdir())
      const result = await compileWorkflowSource({ source: SAMPLE_TS, filename })
      expect(result.ok).toBe(true)
      expect(result.manifest?.schema).toBe("@executioncontrolprotocol.workflow")
    } finally {
      process.chdir(prevCwd)
    }
  })
})
