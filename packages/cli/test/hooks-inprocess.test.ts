import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Hook, Interfaces } from "@oclif/core"
import { ECP_PLUGINS_MISSING, EcpCliError } from "@executioncontrolprotocol/plugin-sdk"
import { afterEach, describe, expect, it } from "vitest"
import commandNotFound from "../src/hooks/command-not-found.js"
import jitInstall from "../src/hooks/jit-install.js"
import trust from "../src/hooks/trust.js"
import initHost from "../src/hooks/init-host.js"
import { clearHost, getHost } from "@executioncontrolprotocol/plugin-sdk"
import { evaluateTrust, assertTrusted } from "../src/lib/evaluate-trust.js"
import { rememberTrust } from "../src/lib/trust-store.js"

function hookThis(jitPlugins: Record<string, string> = {}): {
  logs: string[]
  exits: number[]
  log: (message?: string) => void
  exit: (code?: number) => never
  error: (message: string, opts?: { exit?: number }) => never
  config: {
    runCommand: (id: string, argv?: string[]) => Promise<void>
    dataDir: string
    pjson: { oclif: { jitPlugins: Record<string, string> } }
  }
} {
  const logs: string[] = []
  const exits: number[] = []
  return {
    logs,
    exits,
    log: (message?: string) => {
      logs.push(String(message ?? ""))
    },
    exit: ((code?: number) => {
      exits.push(code ?? 0)
      const err = new Error("EEXIT") as Error & { exitCode: number }
      err.exitCode = code ?? 0
      throw err
    }) as never,
    error: ((message: string, opts?: { exit?: number }) => {
      const err = new Error(message) as Error & { exitCode: number }
      err.exitCode = opts?.exit ?? 1
      throw err
    }) as never,
    config: {
      runCommand: async () => undefined,
      dataDir: join(tmpdir(), "ecp-hook-data"),
      pjson: { oclif: { jitPlugins } },
    },
  }
}

describe("command_not_found", () => {
  it("redirects ecp plugin to ecp plugins with --json", async () => {
    const self = hookThis()
    await expect(
      (commandNotFound as Hook<"command_not_found">).call(self as never, {
        id: "plugin:build",
        argv: ["--json"],
      })
    ).rejects.toThrow(/EEXIT/)
    expect(JSON.parse(self.logs[0] ?? "{}")).toMatchObject({
      ok: false,
      error: { code: ECP_PLUGINS_MISSING },
    })
  })

  it("maps an unknown topic to plugin-<topic>", async () => {
    const self = hookThis()
    await expect(
      (commandNotFound as Hook<"command_not_found">).call(self as never, {
        id: "jsonata",
        argv: ["--json"],
      })
    ).rejects.toThrow(/EEXIT/)
    expect(self.exits[0]).toBe(3)
    expect(self.logs[0]).toMatch(/plugin-jsonata/)
  })

  it("prints a non-json missing-plugin hint", async () => {
    const self = hookThis()
    await expect(
      (commandNotFound as Hook<"command_not_found">).call(self as never, { id: "jsonata", argv: [] })
    ).rejects.toThrow(/EEXIT/)
    expect(self.logs[0]).toMatch(/ecp plugins install jsonata/)
  })

  it("skips JIT topics so oclif can install @executioncontrolprotocol/mcp", async () => {
    const self = hookThis({ "@executioncontrolprotocol/mcp": "^1" })
    await (commandNotFound as Hook<"command_not_found">).call(self as never, {
      id: "mcp:serve",
      argv: [],
    })
    expect(self.exits).toEqual([])
    expect(self.logs).toEqual([])
  })

  it("still maps jsonata when mcp is the only JIT plugin", async () => {
    const self = hookThis({ "@executioncontrolprotocol/mcp": "^1" })
    await expect(
      (commandNotFound as Hook<"command_not_found">).call(self as never, {
        id: "jsonata",
        argv: ["--json"],
      })
    ).rejects.toThrow(/EEXIT/)
    expect(self.logs[0]).toMatch(/plugin-jsonata/)
  })
})

describe("jit_plugin_not_installed", () => {
  it("returns ECP_PLUGINS_MISSING under --json", async () => {
    const self = hookThis()
    const argv = process.argv
    process.argv = ["node", "ecp", "--json"]
    try {
      await expect(
        (jitInstall as Hook<"jit_plugin_not_installed">).call(self as never, {
          pluginName: "@executioncontrolprotocol/mcp",
          pluginVersion: "1.0.0",
        })
      ).rejects.toThrow(/EEXIT/)
      expect(JSON.parse(self.logs[0] ?? "{}")).toMatchObject({
        ok: false,
        error: { code: ECP_PLUGINS_MISSING },
      })
    } finally {
      process.argv = argv
    }
  })

  it("exits when confirm is refused", async () => {
    const self = hookThis()
    await expect(
      (jitInstall as Hook<"jit_plugin_not_installed">).call(self as never, {
        pluginName: "@executioncontrolprotocol/plugin-app",
        pluginVersion: "latest",
      })
    ).rejects.toThrow(/EEXIT/)
    expect(self.logs[0]).toMatch(/plugins install/)
  })
})

describe("plugins:preinstall trust", () => {
  it("allows first-party npm packages", async () => {
    const self = hookThis()
    await (trust as Hook<"plugins:preinstall">).call(self as never, {
      plugin: { name: "@executioncontrolprotocol/plugin-jsonata" },
    } as never)
    expect(self.logs).toEqual([])
  })

  it("denies third-party packages without --yes and prints JSON", async () => {
    const self = hookThis()
    const argv = process.argv
    process.argv = ["node", "ecp", "plugins", "install", "acme", "--json"]
    try {
      await expect(
        (trust as Hook<"plugins:preinstall">).call(self as never, { plugin: { name: "acme-plugin" } } as never)
      ).rejects.toThrow()
    } finally {
      process.argv = argv
    }
  })
})

describe("init-host", () => {
  afterEach(() => {
    clearHost()
  })

  it("skips help and version", async () => {
    await (initHost as Hook<"init">).call({} as never, {
      id: "help",
      argv: [],
      config: { getPluginsList: () => [] } as unknown as Interfaces.Config,
    })
    expect(() => getHost()).toThrow(/init hook/)
  })

  it("creates a host from installed plugin definitions", async () => {
    await (initHost as Hook<"init">).call({} as never, {
      id: "describe",
      argv: [],
      config: { getPluginsList: () => [] } as unknown as Interfaces.Config,
    })
    const host = getHost()
    expect(host.environmentId).toBe("@executioncontrolprotocol/node")
    expect(host.ecp).toBeDefined()
    expect(host.rebuild).toBeTypeOf("function")
    const next = await host.rebuild?.()
    expect(next).toBeDefined()
    expect(next).not.toBe(host)
    expect(getHost()).toBe(next)
    await next?.ecp.terminate()
  }, 30_000)
})

describe("evaluateTrust", () => {
  it("allows first-party npm and denies git/path without --allow-source", async () => {
    const config = { dataDir: join(tmpdir(), "ecp-trust-none") } as Interfaces.Config
    expect(await evaluateTrust(config, "@executioncontrolprotocol/plugin-jsonata")).toEqual({ allowed: true })
    expect((await evaluateTrust(config, "git+https://example.com/repo.git")).allowed).toBe(false)
    expect((await evaluateTrust(config, "./local-plugin")).allowed).toBe(false)
    await expect(assertTrusted(config, "acme-plugin", [])).rejects.toBeInstanceOf(EcpCliError)
  })

  it("honors ECP_ALLOW_SOURCE and ECP_TRUST_THIRD_PARTY for path specs", async () => {
    const prevSource = process.env.ECP_ALLOW_SOURCE
    const prevTrust = process.env.ECP_TRUST_THIRD_PARTY
    const dir = await mkdtemp(join(tmpdir(), "ecp-trust-env-"))
    const config = { dataDir: dir } as Interfaces.Config
    try {
      delete process.env.ECP_ALLOW_SOURCE
      delete process.env.ECP_TRUST_THIRD_PARTY
      expect((await evaluateTrust(config, "./local-plugin", [])).allowed).toBe(false)
      process.env.ECP_ALLOW_SOURCE = "path"
      expect((await evaluateTrust(config, "./local-plugin", [])).allowed).toBe(false)
      process.env.ECP_TRUST_THIRD_PARTY = "1"
      expect((await evaluateTrust(config, "./local-plugin", [])).allowed).toBe(true)
      process.env.ECP_ALLOW_SOURCE = "git"
      expect((await evaluateTrust(config, "./local-plugin", [])).allowed).toBe(false)
      expect((await evaluateTrust(config, "git+https://example.com/repo.git", [])).allowed).toBe(true)
    } finally {
      if (prevSource === undefined) delete process.env.ECP_ALLOW_SOURCE
      else process.env.ECP_ALLOW_SOURCE = prevSource
      if (prevTrust === undefined) delete process.env.ECP_TRUST_THIRD_PARTY
      else process.env.ECP_TRUST_THIRD_PARTY = prevTrust
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("honors remembered trust and --yes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-trust-"))
    const config = { dataDir: dir } as Interfaces.Config
    await rememberTrust(config, "acme-plugin", true)
    expect(await evaluateTrust(config, "acme-plugin")).toEqual({ allowed: true })
    await rememberTrust(config, "denied-plugin", false)
    expect((await evaluateTrust(config, "denied-plugin")).allowed).toBe(false)
    const yesDir = await mkdtemp(join(tmpdir(), "ecp-trust-yes-"))
    const yesConfig = { dataDir: yesDir } as Interfaces.Config
    expect((await evaluateTrust(yesConfig, "new-plugin", ["--yes"])).allowed).toBe(true)
  })
})
