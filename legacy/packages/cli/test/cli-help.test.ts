import { rm } from "node:fs/promises"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { hermeticCliEnv, runCli } from "./helpers.js"

describe("ecp --help", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticCliEnv()
    home = hermetic.dir
    env = hermetic.env
  })

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("prints top-level help", { timeout: 60_000 }, async () => {
    const res = await runCli(["--help"], { env })
    expect(res.code).toBe(0)
    const out = `${res.stdout}\n${res.stderr}`
    expect(out).toMatch(/\bworkflows\b/)
    expect(out).toMatch(/\benvironments\b/)
    expect(out).toMatch(/\brun\b/)
    expect(out).toMatch(/config\s+Manage local CLI configuration/)
    expect(out).not.toMatch(/config\s+Manage OS keychain secrets/)
    expect(out).not.toMatch(/^\s+compile\s/m)
    expect(out).not.toMatch(/^\s+validate\s/m)
    expect(out).not.toMatch(/^\s+describe\s/m)
    expect(out).not.toMatch(/^\s+encode\s/m)
    expect(out).not.toMatch(/^\s+decode\s/m)
    expect(out).not.toMatch(/^\s+up\s/m)
    expect(out).not.toMatch(/^\s+mcp\s/m)
  })

  it("prints per-command help", { timeout: 60_000 }, async () => {
    for (const args of [
      ["run"],
      ["workflows", "compile"],
      ["workflows", "validate"],
      ["environments", "describe"],
      ["environments", "search"],
      ["environments", "invoke"],
      ["config"],
      ["config", "secrets"],
      ["config", "secrets", "add"],
    ]) {
      const res = await runCli([...args, "--help"], { env })
      expect(res.code, args.join(" ")).toBe(0)
    }
  })
})
