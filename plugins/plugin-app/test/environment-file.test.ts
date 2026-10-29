import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  configFileTemplate,
  ensureAppConfigPath,
  resolveAppConfigPath,
  USER_CONFIG_FILENAMES,
} from "../src/environment-file.js"

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

describe("ensureAppConfigPath", () => {
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

  it("scaffolds config.ecp.ts in configDir when missing", async () => {
    const config = await configDir()
    const ensured = await ensureAppConfigPath({ configDir: config })
    expect(ensured?.created).toBe(true)
    expect(ensured?.path).toBe(join(config, "config.ecp.ts"))
    const source = await readFile(ensured!.path, "utf8")
    expect(source).toBe(configFileTemplate())
    expect(source).toContain("config().with([")
  })

  it("does not overwrite an existing default file", async () => {
    const config = await configDir()
    const path = join(config, "config.ecp.ts")
    await writeFile(path, "export default config().with([])\n", "utf8")
    const ensured = await ensureAppConfigPath({ configDir: config })
    expect(ensured).toEqual({ path, created: false })
    expect(await readFile(path, "utf8")).toBe("export default config().with([])\n")
  })

  it("returns undefined when neither flag nor configDir is set", async () => {
    await expect(ensureAppConfigPath({})).resolves.toBeUndefined()
  })

  it("scaffolds a missing --config path", async () => {
    const config = await configDir()
    const flagged = join(config, "custom.ecp.ts")
    const ensured = await ensureAppConfigPath({ configFlag: flagged, configDir: config })
    expect(ensured).toEqual({ path: flagged, created: true })
    expect(await readFile(flagged, "utf8")).toBe(configFileTemplate())
  })
})
