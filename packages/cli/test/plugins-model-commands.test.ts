import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { rm } from "node:fs/promises"
import { hermeticCliEnv, runCli } from "./helpers.js"

describe("ecp model plugin commands", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticCliEnv()
    home = hermetic.dir
    env = hermetic.env
    for (const plugin of ["plugin-anthropic", "plugin-openai", "plugin-ollama"] as const) {
      const linked = await runCli(["plugins", "link", `plugins/${plugin}`], { env })
      expect(linked.code, `${plugin} link\n${linked.stdout}\n${linked.stderr}`).toBe(0)
    }
  }, 60_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("ecp openai generate --help --json", async () => {
    const res = await runCli(["openai", "generate", "--help", "--json"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/openai/i)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/generate/i)
  }, 30_000)

  it("ecp anthropic generate --help --json", async () => {
    const res = await runCli(["anthropic", "generate", "--help", "--json"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/anthropic/i)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/generate/i)
  }, 30_000)

  it("ecp ollama generate --help --json", async () => {
    const res = await runCli(["ollama", "generate", "--help", "--json"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/ollama/i)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/generate/i)
  }, 30_000)

  it("ecp ollama listModels --help --json", async () => {
    const res = await runCli(["ollama", "listModels", "--help", "--json"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/listModels|list models/i)
  }, 30_000)
})
