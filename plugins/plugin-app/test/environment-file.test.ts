import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { resolveAppOverlayPath, USER_ENVIRONMENT_FILENAMES } from "../src/environment-file.js"

describe("resolveAppOverlayPath", () => {
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

  it("returns the --env path resolved against cwd", async () => {
    const config = await configDir()
    await writeFile(join(config, "environment.ecp.ts"), "// unused\n", "utf8")
    const flagged = join(config, "custom.ecp.ts")
    expect(resolveAppOverlayPath({ envFlag: flagged, configDir: config })).toBe(flagged)
  })

  it("picks environment.ecp.ts in configDir when --env is omitted", async () => {
    const config = await configDir()
    const expected = join(config, "environment.ecp.ts")
    await writeFile(expected, "export default {}\n", "utf8")
    expect(resolveAppOverlayPath({ configDir: config })).toBe(expected)
  })

  it("falls through filenames until one exists", async () => {
    const config = await configDir()
    const expected = join(config, "environment.ts")
    await writeFile(expected, "export default {}\n", "utf8")
    expect(USER_ENVIRONMENT_FILENAMES).toContain("environment.ts")
    expect(resolveAppOverlayPath({ configDir: config })).toBe(expected)
  })

  it("returns undefined when no overlay exists", async () => {
    const config = await configDir()
    expect(resolveAppOverlayPath({ configDir: config })).toBeUndefined()
    expect(resolveAppOverlayPath({})).toBeUndefined()
  })
})
