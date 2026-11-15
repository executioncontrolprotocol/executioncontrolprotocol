import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  compileWorkflowSource,
  resolveBundleDir,
  resolveCoreFromHost,
  resetCoreMajorMismatchWarning,
  warnIfCoreMajorMismatch,
} from "@executioncontrolprotocol/node"
import { Registry } from "@executioncontrolprotocol/core"
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
  const temps: string[] = []

  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it("uses dirname for absolute paths", () => {
    const abs = join(tmpdir(), "proj", "src", "workflow.ts")
    expect(resolveBundleDir(abs)).toBe(dirname(abs))
  })

  it("walks up from a nested relative path to the nearest node_modules", async () => {
    const project = await mkdtemp(join(tmpdir(), "ecp-resolve-dir-"))
    temps.push(project)
    const nested = join(project, "apps", "bot", "workflows")
    await mkdir(join(project, "node_modules"), { recursive: true })
    await mkdir(nested, { recursive: true })

    const prevCwd = process.cwd()
    try {
      process.chdir(project)
      expect(resolveBundleDir(join("apps", "bot", "workflows", "workflow.ts"))).toBe(project)
      expect(
        existsSync(join(resolveBundleDir(join("apps", "bot", "workflows", "workflow.ts")), "node_modules")),
      ).toBe(true)
    } finally {
      process.chdir(prevCwd)
    }
  })

  it("uses cwd for bare filenames", () => {
    expect(resolveBundleDir("workflow.ts")).toBe(process.cwd())
  })
})

describe("compileWorkflowSource consumer resolution", () => {
  const temps: string[] = []

  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
    resetCoreMajorMismatchWarning()
  })

  it(
    "resolves @executioncontrolprotocol/core from the project node_modules via absolute filename",
    async () => {
      await registerTestExtension(new Registry())
      const project = await mkdtemp(join(tmpdir(), "ecp-consumer-ok-"))
      temps.push(project)
      const nested = join(project, "nested", "deep")
      await mkdir(nested, { recursive: true })
      await linkPkg(project, "core", join(repoRoot, "packages/core"))

      const filename = join(nested, "workflow.ts")
      await writeFile(filename, SAMPLE_TS, "utf8")

      const result = await compileWorkflowSource({ source: SAMPLE_TS, filename })
      expect(result.ok).toBe(true)
      expect(result.manifest?.steps[0]?.as).toBe("out")
    },
    15_000
  )

  it(
    "falls back to the host / CLI core when the project has no node_modules copy",
    async () => {
      await registerTestExtension(new Registry())
      expect(resolveCoreFromHost("@executioncontrolprotocol/core")).toBeTruthy()

      const project = await mkdtemp(join(tmpdir(), "ecp-consumer-host-"))
      temps.push(project)
      const nested = join(project, "src")
      await mkdir(nested, { recursive: true })
      const filename = join(nested, "workflow.ts")
      await writeFile(filename, SAMPLE_TS, "utf8")

      const prevCwd = process.cwd()
      try {
        process.chdir(project)
        const result = await compileWorkflowSource({ source: SAMPLE_TS, filename })
        expect(result.ok).toBe(true)
        expect(result.manifest?.schema).toBe("@executioncontrolprotocol.workflow")
      } finally {
        process.chdir(prevCwd)
      }
    },
    15_000
  )

  it("resolves from a nested absolute path even when cwd is elsewhere", async () => {
    await registerTestExtension(new Registry())
    const project = await mkdtemp(join(tmpdir(), "ecp-consumer-nested-"))
    temps.push(project)
    const nested = join(project, "apps", "bot", "workflows")
    await mkdir(nested, { recursive: true })
    await linkPkg(project, "core", join(repoRoot, "packages/core"))

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

  it("warns once when local and host core majors differ", async () => {
    const localRoot = await mkdtemp(join(tmpdir(), "ecp-core-local-"))
    const hostRoot = await mkdtemp(join(tmpdir(), "ecp-core-host-"))
    temps.push(localRoot, hostRoot)
    await writeFile(
      join(localRoot, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/core", version: "1.0.0" }),
      "utf8"
    )
    await writeFile(
      join(hostRoot, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/core", version: "0.52.0" }),
      "utf8"
    )
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    resetCoreMajorMismatchWarning()
    warnIfCoreMajorMismatch(join(localRoot, "dist", "index.js"), join(hostRoot, "dist", "index.js"))
    expect(write).toHaveBeenCalledOnce()
    expect(String(write.mock.calls[0]?.[0])).toMatch(/major 1 differs.*major 0/)
    warnIfCoreMajorMismatch(join(localRoot, "dist", "index.js"), join(hostRoot, "dist", "index.js"))
    expect(write).toHaveBeenCalledOnce()
    write.mockRestore()
  })

  it("does not warn when majors match", async () => {
    const localRoot = await mkdtemp(join(tmpdir(), "ecp-core-same-a-"))
    const hostRoot = await mkdtemp(join(tmpdir(), "ecp-core-same-b-"))
    temps.push(localRoot, hostRoot)
    await writeFile(
      join(localRoot, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/core", version: "0.52.0" }),
      "utf8"
    )
    await writeFile(
      join(hostRoot, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/core", version: "0.52.1" }),
      "utf8"
    )
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    resetCoreMajorMismatchWarning()
    warnIfCoreMajorMismatch(join(localRoot, "index.js"), join(hostRoot, "index.js"))
    expect(write).not.toHaveBeenCalled()
    write.mockRestore()
  })
})
