import { rm } from "node:fs/promises"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { hermeticCliEnv, runCli } from "./helpers.js"

describe("ecp app after plugins link", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticCliEnv()
    home = hermetic.dir
    env = hermetic.env
    const linked = await runCli(["plugins", "link", "plugins/plugin-app"], { env })
    expect(linked.code).toBe(0)
  }, 60_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("prints app help", async () => {
    const help = await runCli(["app", "--help"], { env })
    expect(help.code).toBe(0)
    const text = `${help.stdout}\n${help.stderr}`
    expect(text).toMatch(/live graph/i)
    expect(text).toMatch(/--no-open/)
    expect(text).toMatch(/127\.0\.0\.1/)
  }, 30_000)
})
