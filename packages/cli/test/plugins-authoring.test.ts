import { createServer } from "node:http"
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Config } from "@oclif/core"
import { hermeticCliEnv, repoRoot, runCli, runHelp } from "./helpers.js"

describe("ecp plugin authoring", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticCliEnv()
    home = hermetic.dir
    env = hermetic.env
  }, 30_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("ecp plugins new creates a plugin that builds", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "ecp-new-plugin-"))
    try {
      const created = await runCli(["plugins", "new", "demo"], { cwd: scratch, env })
      expect(created.code).toBe(0)
      const dir = join(scratch, "plugin-demo")
      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as { name: string }
      expect(pkg.name).toBe("@executioncontrolprotocol/plugin-demo")
      const source = await readFile(join(dir, "src", "index.ts"), "utf8")
      expect(source).toMatch(/defineExtension/)
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  }, 30_000)

  it("ecp plugins check fails after the definition changes", async () => {
    const fixture = join(repoRoot, "packages/cli/test/fixtures/plugin-stale")
    await mkdir(join(fixture, "dist"), { recursive: true })
    const result = await runCli(["plugins", "check", fixture], { env })
    expect(result.code).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/stale|missing|Cannot load/i)
  }, 30_000)

  it("no command id in the plugins topic is defined twice", async () => {
    const config = await Config.load({ root: join(repoRoot, "packages/cli") })
    const ids = config.commands.map((cmd) => cmd.id)
    const pluginsIds = ids.filter((id) => id === "plugins" || id.startsWith("plugins:"))
    expect(pluginsIds.length).toBeGreaterThan(0)
    expect(new Set(pluginsIds).size).toBe(pluginsIds.length)
  }, 30_000)

  it("ecp plugin build points at ecp plugins build", async () => {
    const res = await runCli(["plugin", "build", "--json"], { env })
    expect(res.code).toBe(3)
    expect(`${res.stdout}\n${res.stderr}`).toMatch(/ecp plugins build/)
  }, 30_000)
})

describe("ecp plugins link jsonata", () => {
  it("ecp jsonata transform --json returns the envelope after link", async () => {
    const hermetic = await hermeticCliEnv()
    try {
      const linked = await runCli(["plugins", "link", "plugins/plugin-jsonata"], {
        env: hermetic.env,
      })
      expect(linked.code).toBe(0)
      const fixture = join(hermetic.dir, "payload.json")
      await writeFile(fixture, JSON.stringify({ payload: { a: 1 } }), "utf8")
      const res = await runCli(
        ["jsonata", "transform", "--expression", "$.a", "--input", fixture, "--json"],
        { env: hermetic.env }
      )
      expect(res.code).toBe(0)
      const body = JSON.parse(res.stdout) as { ok: boolean; data: { result: unknown } }
      expect(body.ok).toBe(true)
      expect(body.data.result).toBe(1)
    } finally {
      await rm(hermetic.dir, { recursive: true, force: true })
    }
  }, 60_000)

  it("ecp jsonata transform failure prints ECP_STEP_FAILED and the invoke record", async () => {
    const hermetic = await hermeticCliEnv()
    try {
      const linked = await runCli(["plugins", "link", "plugins/plugin-jsonata"], {
        env: hermetic.env,
      })
      expect(linked.code).toBe(0)
      const fixture = join(hermetic.dir, "payload.json")
      await writeFile(fixture, JSON.stringify({ payload: { a: 1 } }), "utf8")

      const text = await runCli(
        ["jsonata", "transform", "--expression", "[", "--input", fixture],
        { env: hermetic.env }
      )
      expect(text.code).toBe(1)
      expect(text.stdout).toContain("Step invoke")
      expect(text.stdout).toContain("Error Code: ECP_STEP_FAILED")
      expect(text.stdout).toContain("Invalid JSONata expression")
      expect(text.stdout).toContain("status: failed")
      expect(() => JSON.parse(text.stdout)).toThrow()

      const json = await runCli(
        ["jsonata", "transform", "--expression", "[", "--input", fixture, "--json"],
        { env: hermetic.env }
      )
      expect(json.code).toBe(1)
      const body = JSON.parse(json.stdout) as {
        ok: false
        error: { code: string; message: string }
        data: {
          runId: string
          stepId: string
          capabilityId: string
          status: string
          diagnostics: { code: string; message: string }[]
        }
      }
      expect(body.ok).toBe(false)
      expect(body.error.code).toBe("ECP_STEP_FAILED")
      expect(body.error.message).toMatch(/Invalid JSONata expression/)
      expect(body.data.stepId).toBe("invoke")
      expect(body.data.capabilityId).toBe("@executioncontrolprotocol/jsonata.transform")
      expect(body.data.status).toBe("failed")
      expect(body.data.diagnostics[0]?.code).toBe("ECP_STEP_FAILED")
    } finally {
      await rm(hermetic.dir, { recursive: true, force: true })
    }
  }, 60_000)

  it("ecp jsonata without the plugin returns ECP_PLUGINS_MISSING and exit 3", async () => {
    const server = createServer((req, res) => {
      if (req.url?.includes("plugin-jsonata")) {
        res.statusCode = 200
        res.end("{}")
        return
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    const port = typeof address === "object" && address ? address.port : 0
    const hermetic = await hermeticCliEnv({
      ECP_NPM_REGISTRY: `http://127.0.0.1:${port}`,
    })
    try {
      const res = await runCli(["jsonata", "--json"], { env: hermetic.env })
      expect(res.code).toBe(3)
      const body = JSON.parse(res.stdout) as { ok: boolean; error: { code: string } }
      expect(body.ok).toBe(false)
      expect(body.error.code).toBe("ECP_PLUGINS_MISSING")
    } finally {
      await rm(hermetic.dir, { recursive: true, force: true })
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
    }
  }, 30_000)
})

describe("ecp discover", () => {
  it("returns plugins from a mocked registry", async () => {
    const server = createServer((req, res) => {
      if (req.url?.startsWith("/-/v1/search")) {
        res.setHeader("content-type", "application/json")
        res.end(
          JSON.stringify({
            objects: [
              {
                package: {
                  name: "@executioncontrolprotocol/plugin-jsonata",
                  version: "1.0.0",
                  description: "JSONata",
                  date: "2026-01-01T00:00:00.000Z",
                },
              },
            ],
          })
        )
        return
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    const port = typeof address === "object" && address ? address.port : 0
    const hermetic = await hermeticCliEnv({
      ECP_NPM_REGISTRY: `http://127.0.0.1:${port}`,
    })
    try {
      const res = await runCli(["plugins", "discover", "--json"], { env: hermetic.env })
      expect(res.code).toBe(0)
      const body = JSON.parse(res.stdout) as {
        ok?: boolean
        data?: { plugins: { name: string; firstParty: boolean }[] }
        plugins?: { name: string }[]
      }
      const plugins = body.data?.plugins ?? body.plugins
      expect(plugins?.some((p) => p.name === "@executioncontrolprotocol/plugin-jsonata")).toBe(true)
    } finally {
      await rm(hermetic.dir, { recursive: true, force: true })
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
    }
  }, 30_000)
})

describe("plugin trust", () => {
  it("allows first-party packages and refuses third-party without --yes", async () => {
    const hermetic = await hermeticCliEnv()
    const prevData = process.env.ECP_DATA_DIR
    const prevConfig = process.env.ECP_CONFIG_DIR
    const prevTrust = process.env.ECP_TRUST_THIRD_PARTY
    process.env.ECP_DATA_DIR = hermetic.dir
    process.env.ECP_CONFIG_DIR = hermetic.dir
    delete process.env.ECP_TRUST_THIRD_PARTY
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true })
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true })
    try {
      const { evaluateTrust } = await import("../src/lib/evaluate-trust.js")
      const config = await Config.load({ root: join(repoRoot, "packages/cli") })
      const first = await evaluateTrust(
        config,
        "@executioncontrolprotocol/plugin-jsonata",
        []
      )
      expect(first.allowed).toBe(true)
      const third = await evaluateTrust(config, "@acme/other-plugin", [])
      expect(third.allowed).toBe(false)
      const yes = await evaluateTrust(config, "@acme/other-plugin", ["--yes"])
      expect(yes.allowed).toBe(true)
    } finally {
      if (prevData === undefined) delete process.env.ECP_DATA_DIR
      else process.env.ECP_DATA_DIR = prevData
      if (prevConfig === undefined) delete process.env.ECP_CONFIG_DIR
      else process.env.ECP_CONFIG_DIR = prevConfig
      if (prevTrust === undefined) delete process.env.ECP_TRUST_THIRD_PARTY
      else process.env.ECP_TRUST_THIRD_PARTY = prevTrust
      await rm(hermetic.dir, { recursive: true, force: true })
    }
  }, 30_000)
})

describe("help still lists authoring commands", () => {
  it("plugins new help exists", () => {
    const out = runHelp("plugins new")
    expect(out).toMatch(/Scaffold/i)
  })
})
