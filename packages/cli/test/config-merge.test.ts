import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { extension, testExtension } from "@executioncontrolprotocol/core"
import { ECP_PLUGINS_MISSING } from "@executioncontrolprotocol/core/types"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { mergeConfigFile } from "../src/lib/layer-environment.js"
import { hermeticWithPluginTest, runCli } from "./helpers.js"

function bindingId(binding: { getRef: () => unknown }): string {
  const ref = binding.getRef()
  if (typeof ref === "string") return ref
  if (typeof ref === "object" && ref !== null && "id" in ref) return String((ref as { id: string }).id)
  return String(ref)
}

const EMPTY_CONFIG = `import { config } from "@executioncontrolprotocol/core"

export default config().with([])
`

const MERGE_CONFIG = `import { config, extension } from "@executioncontrolprotocol/core"

export default config().with([
  extension("@executioncontrolprotocol/test").with({ defaultModel: "cli-model" }),
])
`

const MISSING_PLUGIN_CONFIG = `import { config, extension } from "@executioncontrolprotocol/core"

export default config().with([
  extension("@executioncontrolprotocol/jsonata"),
])
`

describe("config merge onto process host", () => {
  it("empty config().with([]) still lists installed plugins", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-empty-config-"))
    const path = join(dir, "config.ecp.ts")
    await writeFile(path, EMPTY_CONFIG, "utf8")
    const env = environment(NODE_ENVIRONMENT_ID, "merge-empty").with([extension(testExtension)])
    await mergeConfigFile(env, { configFlag: path })
    const ecp = await env.init()
    try {
      const descriptor = await ecp.describe()
      expect(descriptor.capabilities.some((row) => row.id.includes("echo"))).toBe(true)
    } finally {
      await ecp.terminate()
      await rm(dir, { recursive: true, force: true })
    }
  }, 30_000)

  it("merges config onto a matching installed extension without replacing it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-merge-config-"))
    const path = join(dir, "config.ecp.ts")
    await writeFile(path, MERGE_CONFIG, "utf8")
    const env = environment(NODE_ENVIRONMENT_ID, "merge-model").with([extension(testExtension)])
    await mergeConfigFile(env, { configFlag: path })
    const testBinding = env.getBindings().find((row) => bindingId(row) === "@executioncontrolprotocol/test")
    expect(testBinding?.getConfig()).toEqual({ defaultModel: "cli-model" })
    expect(env.getBindings().some((row) => bindingId(row) === "@executioncontrolprotocol/test")).toBe(true)
    await rm(dir, { recursive: true, force: true })
  }, 30_000)

  it("fails on a missing plugin id and leaves the catalog intact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-missing-config-"))
    const path = join(dir, "config.ecp.ts")
    await writeFile(path, MISSING_PLUGIN_CONFIG, "utf8")
    const env = environment(NODE_ENVIRONMENT_ID, "merge-missing").with([extension(testExtension)])
    await expect(mergeConfigFile(env, { configFlag: path })).rejects.toMatchObject({
      code: ECP_PLUGINS_MISSING,
    })
    expect(env.getBindings().some((row) => bindingId(row) === "@executioncontrolprotocol/test")).toBe(true)
    expect(env.getBindings().some((row) => bindingId(row) === "@executioncontrolprotocol/jsonata")).toBe(false)
    await rm(dir, { recursive: true, force: true })
  }, 30_000)

  it("auto-loads default config.ecp.ts without --config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-autoload-config-"))
    await writeFile(join(dir, "config.ecp.ts"), MERGE_CONFIG, "utf8")
    const env = environment(NODE_ENVIRONMENT_ID, "merge-auto").with([extension(testExtension)])
    await mergeConfigFile(env, { configDir: dir })
    const testBinding = env.getBindings().find((row) => bindingId(row) === "@executioncontrolprotocol/test")
    expect(testBinding?.getConfig()).toEqual({ defaultModel: "cli-model" })
    await rm(dir, { recursive: true, force: true })
  }, 30_000)
})

describe("ecp describe with linked plugin-test and empty config", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticWithPluginTest()
    home = hermetic.dir
    env = hermetic.env
    await writeFile(join(home, "config.ecp.ts"), EMPTY_CONFIG, "utf8")
  }, 60_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("lists plugin-test after an empty default config file", async () => {
    const res = await runCli(["environments", "describe"], { env })
    expect(res.code).toBe(0)
    const descriptor = JSON.parse(res.stdout) as { capabilities: { id: string }[] }
    expect(descriptor.capabilities.some((row) => row.id === "@executioncontrolprotocol/test.echo")).toBe(
      true
    )
  }, 30_000)
})
