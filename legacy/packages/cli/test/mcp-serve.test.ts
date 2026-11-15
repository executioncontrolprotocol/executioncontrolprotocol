import { rm } from "node:fs/promises"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { hermeticCliEnv, runCli } from "./helpers.js"

describe("ecp mcp serve after plugins link", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticCliEnv()
    home = hermetic.dir
    env = hermetic.env
    const linked = await runCli(["plugins", "link", "packages/mcp"], { env })
    expect(linked.code).toBe(0)
  }, 60_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("prints mcp serve help", async () => {
    const help = await runCli(["mcp", "serve", "--help"], { env })
    expect(help.code).toBe(0)
    const text = `${help.stdout}\n${help.stderr}`
    expect(text).toMatch(/stdio/)
    expect(text).toMatch(/--http/)
    expect(text).toMatch(/--allow-remote/)
    expect(text).toMatch(/--tools/)
  }, 30_000)
})
