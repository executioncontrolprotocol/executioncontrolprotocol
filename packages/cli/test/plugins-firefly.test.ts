import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { rm } from "node:fs/promises"
import { hermeticCliEnv, runCli } from "./helpers.js"

describe("ecp adobe-firefly-services topic alias", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticCliEnv()
    home = hermetic.dir
    env = hermetic.env
    const linked = await runCli(["plugins", "link", "plugins/plugin-adobe-firefly-services"], {
      env,
    })
    expect(linked.code, `plugin-adobe-firefly-services link\n${linked.stdout}\n${linked.stderr}`).toBe(
      0
    )
  }, 120_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("ecp adobe-firefly-services --help --json", async () => {
    const res = await runCli(["adobe-firefly-services", "--help", "--json"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/adobe-firefly-services|firefly/i)
  }, 30_000)

  it("ecp firefly --help uses the generated topic alias", async () => {
    const res = await runCli(["firefly", "--help"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/firefly/i)
  }, 30_000)
})
