import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { join } from "node:path"
import { rm } from "node:fs/promises"
import { hermeticCliEnv, repoRoot, runCli } from "./helpers.js"

describe("ecp format and policy plugins", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticCliEnv()
    home = hermetic.dir
    env = hermetic.env
    for (const plugin of [
      "plugin-format-toon",
      "plugin-format-mermaid",
      "plugin-budget",
      "plugin-approval",
      "plugin-state-control",
    ] as const) {
      const linked = await runCli(["plugins", "link", `plugins/${plugin}`], { env })
      expect(linked.code, `${plugin} link\n${linked.stdout}\n${linked.stderr}`).toBe(0)
    }
  }, 90_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("ecp format-toon encode --input fixture --json", async () => {
    const fixture = join(repoRoot, "plugins/plugin-format-toon/test/fixtures/encode-input.json")
    const res = await runCli(["format-toon", "encode", "--input", fixture, "--json"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    const body = JSON.parse(res.stdout) as {
      ok: boolean
      data: { success?: boolean; result?: unknown; diagnostics?: unknown }
    }
    expect(body.ok, `${res.stdout}\n${res.stderr}`).toBe(true)
    expect(body.data.success, JSON.stringify(body.data)).toBe(true)
    expect(String(body.data.result)).toMatch(/schema|workflow|Echo/i)
  }, 30_000)

  it("ecp describe --policies --json lists linked policy plugins", async () => {
    const res = await runCli(["environments", "describe", "--policies", "--json"], { env })
    expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(0)
    const body = JSON.parse(res.stdout) as {
      ok: boolean
      data: { policies: { id: string }[] }
    }
    expect(body.ok).toBe(true)
    const ids = body.data.policies.map((p) => p.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        "@executioncontrolprotocol/budget",
        "@executioncontrolprotocol/approval",
        "@executioncontrolprotocol/state-control",
      ])
    )
  }, 30_000)
})

describe("ecp --format toon without the plugin", () => {
  it("returns ECP_PLUGINS_MISSING naming plugin-format-toon and exit 3", async () => {
    const hermetic = await hermeticCliEnv()
    try {
      const res = await runCli(["environments", "describe", "--json", "--format", "toon"], { env: hermetic.env })
      expect(res.code, `${res.stdout}\n${res.stderr}`).toBe(3)
      const raw = res.stdout.trim() || res.stderr.trim()
      const body = JSON.parse(raw) as {
        ok: boolean
        error: { code: string; details?: { package?: string } }
      }
      expect(body.ok).toBe(false)
      expect(body.error.code).toBe("ECP_PLUGINS_MISSING")
      expect(body.error.details?.package).toBe("@executioncontrolprotocol/plugin-format-toon")
    } finally {
      await rm(hermetic.dir, { recursive: true, force: true })
    }
  }, 30_000)
})
