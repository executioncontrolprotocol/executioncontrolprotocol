import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { resolveAppConfigPath, USER_CONFIG_FILENAMES } from "../src/environment-file.js"

describe("resolveAppConfigPath", () => {
  let dir: string | undefined

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  async function configDir(): Promise<string> {
    const root = join(process.cwd(), ".ecp")
    await mkdir(root, { recursive: true })
    dir = await mkdtemp(join(root, "env-"))
    return dir
  }

  it("returns the --config path resolved against cwd", async () => {
    const config = await configDir()
    await writeFile(join(config, "config.ecp.ts"), "// unused\n", "utf8")
    const flagged = join(config, "custom.ecp.ts")
    expect(resolveAppConfigPath({ configFlag: flagged, configDir: config })).toBe(flagged)
  })

  it("picks config.ecp.ts in configDir when --config is omitted", async () => {
    const config = await configDir()
    const expected = join(config, "config.ecp.ts")
    await writeFile(expected, "export default {}\n", "utf8")
    expect(resolveAppConfigPath({ configDir: config })).toBe(expected)
  })

  it("falls through filenames until one exists", async () => {
    const config = await configDir()
    const expected = join(config, "config.ts")
    await writeFile(expected, "export default {}\n", "utf8")
    expect(USER_CONFIG_FILENAMES).toContain("config.ts")
    expect(resolveAppConfigPath({ configDir: config })).toBe(expected)
  })

  it("falls back to a legacy environment.ecp.ts", async () => {
    const config = await configDir()
    const expected = join(config, "environment.ecp.ts")
    await writeFile(expected, "export default {}\n", "utf8")
    expect(resolveAppConfigPath({ configDir: config })).toBe(expected)
  })

  it("returns undefined when no config file exists", async () => {
    const config = await configDir()
    expect(resolveAppConfigPath({ configDir: config })).toBeUndefined()
    expect(resolveAppConfigPath({})).toBeUndefined()
  })
})
