import { mkdir, mkdtemp, readFile, rm, symlink, writeFile, access } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import {
  bundleEnvironmentSource,
  loadEnvironmentModule,
} from "@executioncontrolprotocol/node"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..")
const resolveZodDir = (): string =>
  dirname(createRequire(join(repoRoot, "packages/core/package.json")).resolve("zod/package.json"))
const temps: string[] = []

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function linkPkg(projectRoot: string, name: string, target: string): Promise<void> {
  const linkPath = name.startsWith("@")
    ? join(projectRoot, "node_modules", name.split("/")[0]!, name.split("/")[1]!)
    : join(projectRoot, "node_modules", name)
  await mkdir(dirname(linkPath), { recursive: true })
  await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir")
}

async function writeCjsNetSdk(pkgDir: string): Promise<void> {
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
}

/**
 * Layout mirrors a real consumer (no monorepo workspace):
 * - vendor extension built as its own package with a nested CJS SDK dep
 * - consumer links the extension + host packages
 * - env import → loadEnvironmentModule → init → invoke
 */
async function setupConsumerWithHeavySdkExtension(): Promise<{
  consumerDir: string
  vendorExtDir: string
  envPath: string
}> {
  const work = await mkdtemp(join(tmpdir(), "ecp-consumer-sdk-"))
  temps.push(work)

  const vendorExtDir = join(work, "vendor", "heavy-sdk-ext")
  await mkdir(join(vendorExtDir, "dist"), { recursive: true })
  await writeFile(
    join(vendorExtDir, "package.json"),
    JSON.stringify(
      {
        name: "@ecp-fixture/heavy-sdk-ext",
        version: "1.0.0",
        type: "module",
        main: "./dist/index.js",
        exports: { ".": { import: "./dist/index.js" } },
        dependencies: {
          "@executioncontrolprotocol/core": "*",
          "fake-cjs-net-sdk": "*",
          zod: "*",
        },
      },
      null,
      2
    ),
    "utf8"
  )
  await writeFile(
    join(vendorExtDir, "dist", "index.js"),
    [
      'import { defineExtension, capabilityFor } from "@executioncontrolprotocol/core"',
      'import { z } from "zod"',
      'import { createRequire } from "node:module"',
      "",
      "const require = createRequire(import.meta.url)",
      'const { probe } = require("fake-cjs-net-sdk")',
      "",
      'export const heavySdkExtension = defineExtension("@ecp-fixture", "heavy-sdk-ext")',
      "  .withConfig({})",
      "  .withCapabilities([",
      '    capabilityFor("@ecp-fixture/heavy-sdk-ext", "probe")',
      "      .withInput(z.object({}))",
      "      .withOutput(z.object({ ok: z.boolean() }))",
      "      .withHandler(async () => ({ ok: probe() })),",
      "  ])",
      "  .build()",
      "",
    ].join("\n"),
    "utf8"
  )

  // SDK lives only under the vendor package (not hoisted to the consumer).
  await writeCjsNetSdk(join(vendorExtDir, "node_modules", "fake-cjs-net-sdk"))
  await linkPkg(vendorExtDir, "@executioncontrolprotocol/core", join(repoRoot, "packages/core"))
  await linkPkg(vendorExtDir, "zod", resolveZodDir())

  const consumerDir = join(work, "consumer")
  await mkdir(consumerDir, { recursive: true })
  await linkPkg(consumerDir, "@ecp-fixture/heavy-sdk-ext", vendorExtDir)
  await linkPkg(consumerDir, "@executioncontrolprotocol/core", join(repoRoot, "packages/core"))
  await linkPkg(consumerDir, "@executioncontrolprotocol/node", join(repoRoot, "packages/environments/node"))
  await linkPkg(consumerDir, "@executioncontrolprotocol/policies", join(repoRoot, "packages/policies"))
  await linkPkg(consumerDir, "zod", resolveZodDir())

  const envPath = join(consumerDir, "environment.ts")
  await writeFile(
    envPath,
    [
      'import { environment, extension, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"',
      'import { heavySdkExtension } from "@ecp-fixture/heavy-sdk-ext"',
      "",
      'export default environment(NODE_ENVIRONMENT_ID, "consumer-heavy-sdk").with([',
      "  extension(heavySdkExtension),",
      "])",
      "",
    ].join("\n"),
    "utf8"
  )

  return { consumerDir, vendorExtDir, envPath }
}

describe("consumer linked heavy-SDK extension", () => {
  it("bundles env without inlining the nested CJS SDK", async () => {
    const coreDist = join(repoRoot, "packages/core/dist/index.js")
    const nodeDist = join(repoRoot, "packages/environments/node/dist/index.js")
    if (!(await pathExists(coreDist)) || !(await pathExists(nodeDist))) {
      throw new Error("Run npm run build before consumer-sdk-extension tests (core/node dist required)")
    }

    const { consumerDir, envPath } = await setupConsumerWithHeavySdkExtension()
    const source = await readFile(envPath, "utf8")
    const code = await bundleEnvironmentSource(source, envPath, consumerDir)

    expect(code).toMatch(/file:\/\/\/?.*heavy-sdk-ext/)
    expect(code).not.toMatch(/require\(["']net["']\)/)
    expect(code).not.toMatch(/fake-cjs-net-sdk/)
  })

  it("loadEnvironmentModule + init + invoke serves the extension capability", async () => {
    const coreDist = join(repoRoot, "packages/core/dist/index.js")
    const nodeDist = join(repoRoot, "packages/environments/node/dist/index.js")
    if (!(await pathExists(coreDist)) || !(await pathExists(nodeDist))) {
      throw new Error("Run npm run build before consumer-sdk-extension tests (core/node dist required)")
    }

    const { envPath } = await setupConsumerWithHeavySdkExtension()
    const env = await loadEnvironmentModule(envPath)
    const ecp = await env.init()
    try {
      const result = await ecp
        .invoke("@ecp-fixture/heavy-sdk-ext.probe")
        .with({})
        .process<{ ok: boolean }>()
      expect(result.success).toBe(true)
      expect(result.result).toEqual({ ok: true })
    } finally {
      await ecp.terminate()
    }
  })

  it("fails to load when the linked extension is missing from the consumer", async () => {
    const work = await mkdtemp(join(tmpdir(), "ecp-consumer-sdk-miss-"))
    temps.push(work)
    const envPath = join(work, "environment.ts")
    await writeFile(
      envPath,
      'import "@ecp-fixture/heavy-sdk-ext"\nexport default { init: async () => ({}) }\n',
      "utf8"
    )
    await expect(loadEnvironmentModule(envPath)).rejects.toThrow(
      /Could not resolve ["']@ecp-fixture\/heavy-sdk-ext["']/
    )
  })
})
