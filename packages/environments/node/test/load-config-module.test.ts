import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadConfigModule } from "../src/loaders/files.js"

describe("loadConfigModule", () => {
  it("returns bindings from config().with([...])", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-load-config-"))
    const path = join(dir, "config.ecp.ts")
    await writeFile(
      path,
      `import { config, extension } from "@executioncontrolprotocol/core"

export default config().with([
  extension("@executioncontrolprotocol/test").with({ defaultModel: "cli-model" }),
])
`,
      "utf8"
    )
    try {
      const bindings = await loadConfigModule(path)
      expect(bindings).toHaveLength(1)
      expect(bindings[0]?.getRef()).toBe("@executioncontrolprotocol/test")
      expect(bindings[0]?.getConfig()).toEqual({ defaultModel: "cli-model" })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 30_000)

  it("accepts a legacy environment() export as bindings only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-load-legacy-"))
    const path = join(dir, "environment.ecp.ts")
    await writeFile(
      path,
      `import { extension } from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "legacy").with([
  extension("@executioncontrolprotocol/test"),
])
`,
      "utf8"
    )
    try {
      const bindings = await loadConfigModule(path)
      expect(bindings).toHaveLength(1)
      expect(bindings[0]?.getRef()).toBe("@executioncontrolprotocol/test")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 30_000)

  it("rejects a module that is not config() or environment()", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-load-bad-"))
    const path = join(dir, "config.ecp.ts")
    await writeFile(path, "export default { not: \"config\" }\n", "utf8")
    try {
      await expect(loadConfigModule(path)).rejects.toThrow(/cannot init/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
