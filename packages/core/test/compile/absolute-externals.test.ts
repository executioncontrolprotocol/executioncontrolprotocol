import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { bundleWorkflowSource } from "../../src/compile/transpile.js"
import { loadEnvironmentModule } from "../../src/loaders/files.js"

const temps: string[] = []

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function writeCjsNetSdk(projectRoot: string): Promise<string> {
  const pkgDir = join(projectRoot, "node_modules", "fake-cjs-net-sdk")
  await mkdir(pkgDir, { recursive: true })
  await writeFile(
    join(pkgDir, "package.json"),
    JSON.stringify({ name: "fake-cjs-net-sdk", version: "1.0.0", main: "index.js" }),
    "utf8"
  )
  await writeFile(
    join(pkgDir, "index.js"),
    [
      '"use strict"',
      'const net = require("net")',
      "module.exports = {",
      "  probe() {",
      "    return typeof net.createServer === \"function\"",
      "  },",
      "}",
      "",
    ].join("\n"),
    "utf8"
  )
  return pkgDir
}

describe("bundleWorkflowSource absolute externals", () => {
  it("loads a CJS package that dynamically requires net from a temp-dir import", async () => {
    const project = await mkdtemp(join(tmpdir(), "ecp-abs-ext-ok-"))
    temps.push(project)
    await writeCjsNetSdk(project)

    const filename = join(project, "env.ts")
    const source = `
import { probe } from "fake-cjs-net-sdk"
export default {
  init: async () => ({ ok: probe() }),
}
`
    await writeFile(filename, source, "utf8")

    const code = await bundleWorkflowSource(source, filename, project)
    expect(code).toMatch(/fake-cjs-net-sdk|file:/)
    expect(code).not.toMatch(/Dynamic require of ["']net["']/)

    const dir = await mkdtemp(join(tmpdir(), "ecp-bundle-run-"))
    temps.push(dir)
    const out = join(dir, "module.mjs")
    await writeFile(out, code, "utf8")
    const mod = (await import(pathToFileURL(out).href)) as {
      default: { init: () => Promise<{ ok: boolean }> }
    }
    const result = await mod.default.init()
    expect(result.ok).toBe(true)
  })

  it("fails clearly when a bare package is missing from the consumer project", async () => {
    const project = await mkdtemp(join(tmpdir(), "ecp-abs-ext-miss-"))
    temps.push(project)
    const filename = join(project, "env.ts")
    const source = `import "definitely-missing-ecp-package-xyz"\nexport default { init: async () => ({}) }\n`
    await writeFile(filename, source, "utf8")

    await expect(bundleWorkflowSource(source, filename, project)).rejects.toThrow(
      /Could not resolve ["']definitely-missing-ecp-package-xyz["']/
    )
  })

  it("leaves Node builtins as bare externals and resolves scoped packages to absolute paths", async () => {
    const project = await mkdtemp(join(tmpdir(), "ecp-abs-ext-edge-"))
    temps.push(project)
    await writeCjsNetSdk(project)

    const scopeDir = join(project, "node_modules", "@ecp-test")
    await mkdir(scopeDir, { recursive: true })
    const scopedPkg = join(scopeDir, "scoped-probe")
    await mkdir(scopedPkg, { recursive: true })
    await writeFile(
      join(scopedPkg, "package.json"),
      JSON.stringify({ name: "@ecp-test/scoped-probe", version: "1.0.0", type: "module", main: "index.js" }),
      "utf8"
    )
    await writeFile(join(scopedPkg, "index.js"), "export const tag = \"scoped\"\n", "utf8")

    const filename = join(project, "check.ts")
    const source = `
import { createServer } from "node:net"
import { tag } from "@ecp-test/scoped-probe"
import { probe } from "fake-cjs-net-sdk"
export default { createServer, tag, probe }
`
    await writeFile(filename, source, "utf8")
    const code = await bundleWorkflowSource(source, filename, project)

    expect(code).toMatch(/from\s+["']node:net["']/)
    expect(code).toMatch(/file:\/\/\/?.*scoped-probe/)
    expect(code).toMatch(/file:\/\/\/?.*fake-cjs-net-sdk/)
  })

  it("loadEnvironmentModule runs CJS net SDK without Dynamic require errors", async () => {
    const project = await mkdtemp(join(tmpdir(), "ecp-abs-ext-env-"))
    temps.push(project)
    await writeCjsNetSdk(project)

    const filename = join(project, "environment.ts")
    const source = `
import { probe } from "fake-cjs-net-sdk"
if (!probe()) throw new Error("net probe failed at load")
export default {
  init: async () => ({ terminate: async () => {} }),
}
`
    await writeFile(filename, source, "utf8")

    const env = await loadEnvironmentModule(filename)
    expect(typeof env.init).toBe("function")
  })
})
