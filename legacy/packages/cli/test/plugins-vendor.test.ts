import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { join } from "node:path"
import { rm } from "node:fs/promises"
import { hermeticCliEnv, repoRoot, runCli } from "./helpers.js"

describe("ecp vendor plugin commands", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticCliEnv()
    home = hermetic.dir
    env = hermetic.env
    for (const plugin of ["plugin-fal", "plugin-image-sharp", "plugin-azure-blob-storage"] as const) {
      const linked = await runCli(["plugins", "link", `plugins/${plugin}`], { env })
      expect(linked.code, `${plugin} link\n${linked.stdout}\n${linked.stderr}`).toBe(0)
    }
  }, 90_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("ecp fal generate --help --json", async () => {
    const res = await runCli(["fal", "generate", "--help", "--json"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/fal/i)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/generate/i)
  }, 30_000)

  it("ecp image-sharp inspect --input fixture --json", async () => {
    const fixture = join(repoRoot, "plugins/plugin-image-sharp/test/fixtures/inspect-input.json")
    const res = await runCli(["image-sharp", "inspect", "--input", fixture, "--json"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    const body = JSON.parse(res.stdout) as {
      ok: boolean
      data: { metadata?: { width?: number; height?: number }; derived?: unknown }
    }
    expect(body.ok, `${res.stdout}\n${res.stderr}`).toBe(true)
    expect(body.data.metadata?.width ?? body.data.derived).toBeTruthy()
  }, 30_000)

  it("ecp azure-blob-storage upload --help --json", async () => {
    const res = await runCli(["azure-blob-storage", "upload", "--help", "--json"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/azure-blob-storage|upload/i)
  }, 30_000)
})
