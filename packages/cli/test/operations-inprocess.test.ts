import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Interfaces } from "@oclif/core"
import { EcpCliError, ECP_PLUGINS_MISSING } from "@executioncontrolprotocol/plugin-sdk"
import { describe, expect, it } from "vitest"
import { COMMANDS } from "../src/commands.js"
import { applyFormat, formatExtensionId } from "../src/lib/format-output.js"
import { commandErrorMessage, readJsonFile, runWithCommandError } from "../src/lib/command-helpers.js"
import { ecpFromEnvFlag, terminateIfNeeded } from "../src/lib/load-ecp.js"
import { listInstalledPlugins, installedPluginNames } from "../src/lib/installed-plugins.js"
import { argvFlagValue, argvHasFlag } from "../src/lib/argv.js"
import { wantsYes } from "../src/lib/confirm.js"
import {
  isFirstPartyPackage,
  npmLatestVersion,
  npmPackageExists,
  npmRegistryOrigin,
  searchEcpPlugins,
} from "../src/lib/npm-registry.js"
import {
  describeOperation,
  invokeOperation,
  searchOperation,
} from "../src/operations/catalog.js"
import { compileOperation, runOperation, validateOperation } from "../src/operations/workflow.js"
import { installOperation } from "../src/operations/install.js"
import { initOperation } from "../src/operations/init.js"
import { discoverOperation } from "../src/operations/discover.js"
import { rollbackOperation } from "../src/operations/rollback.js"
import { updateOperation } from "../src/operations/update.js"
import {
  pluginsBuildOperation,
  pluginsCheckOperation,
  pluginsNewOperation,
} from "../src/operations/plugins.js"
import {
  configSecretsOperation,
  configSecretsAddOperation,
} from "../src/operations/secrets.js"
import {
  testRerunOperation,
  testRunOperation,
  testStartOperation,
  testStatusOperation,
  testTopicOperation,
} from "../src/operations/test-session.js"
import { repoRoot } from "./helpers.js"

const echoWf = join(repoRoot, "examples", "01-echo", "workflow.ecp.ts")

function mockConfig(
  plugins: Array<{ name: string; type?: string; version?: string }> = [],
  runCommand: (id: string, argv?: string[]) => Promise<unknown> = async () => undefined
): Interfaces.Config {
  return {
    getPluginsList: () =>
      plugins.map((plugin) => ({
        name: plugin.name,
        root: "/tmp",
        pjson: {},
        type: plugin.type,
        version: plugin.version,
      })),
    runCommand,
  } as unknown as Interfaces.Config
}

function ctx(
  config: Interfaces.Config = mockConfig(),
  argv: string[] = []
): { host: undefined; config: Interfaces.Config; argv: string[]; json: boolean } {
  return { host: undefined, config, argv, json: true }
}

describe("generated COMMANDS", () => {
  it("includes host operations and no duplicate plugins ids", () => {
    expect(COMMANDS.run).toBeDefined()
    expect(COMMANDS.install).toBeDefined()
    expect(COMMANDS["plugins:new"]).toBeDefined()
    expect(COMMANDS["config:secrets:add"]).toBeDefined()
    const pluginIds = Object.keys(COMMANDS).filter((id) => id === "plugins" || id.startsWith("plugins:"))
    expect(new Set(pluginIds).size).toBe(pluginIds.length)
  })
})

describe("workflow operations", () => {
  it("compiles, validates and runs the echo example", async () => {
    const compiled = await compileOperation.handler({ "workflow-path": echoWf }, ctx())
    expect(compiled).toMatchObject({ schema: "@executioncontrolprotocol.workflow" })

    const dir = await mkdtemp(join(tmpdir(), "ecp-compile-out-"))
    const out = join(dir, "echo.json")
    const written = await compileOperation.handler({ "workflow-path": echoWf, output: out }, ctx())
    expect(written).toBeUndefined()

    const valid = await validateOperation.handler({ "workflow-path": echoWf }, ctx())
    expect(valid).toMatchObject({ valid: true })

    const ran = (await runOperation.handler({ "workflow-path": echoWf }, ctx())) as {
      run: { status: string }
    }
    expect(ran.run.status).toBe("completed")
  }, 30_000)

  it("rejects a missing workflow on compile", async () => {
    await expect(
      compileOperation.handler({ "workflow-path": join(tmpdir(), "missing.ecp.ts") }, ctx())
    ).rejects.toThrow()
  })
})

describe("catalog operations", () => {
  it("describe, search and invoke against the echo environment", async () => {
    const described = (await describeOperation.handler({ policies: true }, ctx())) as {
      extensions: unknown[]
    }
    expect(described.extensions.length).toBeGreaterThan(0)

    const filtered = (await describeOperation.handler(
      { capability: "@executioncontrolprotocol/test.echo", extension: "@executioncontrolprotocol/test" },
      ctx()
    )) as { capabilities: unknown[] }
    expect(Array.isArray(filtered.capabilities)).toBe(true)

    const hits = (await searchOperation.handler({ query: "echo" }, ctx())) as {
      results: unknown[]
    }
    expect(Array.isArray(hits.results)).toBe(true)

    const invoked = (await invokeOperation.handler(
      { "capability-id": "@executioncontrolprotocol/test.echo" },
      ctx()
    )) as { success: boolean }
    expect(invoked.success).toBe(true)
  }, 30_000)

  it("invoke with a missing capability fails", async () => {
    await expect(
      invokeOperation.handler({ "capability-id": "@executioncontrolprotocol/missing.nope" }, ctx())
    ).rejects.toBeInstanceOf(EcpCliError)
  }, 30_000)
})

describe("test session operations", () => {
  it("starts, runs, reruns and reports status", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-session-"))
    const session = join(dir, "session.json")
    await testStartOperation.handler(
      { "workflow-path": echoWf, output: session },
      ctx()
    )
    const advanced = await testRunOperation.handler({ to: "echo", session }, ctx())
    expect(advanced).toBeDefined()
    await testRerunOperation.handler({ "step-id": "echo", session }, ctx())
    const status = await testStatusOperation.handler({ session }, ctx())
    expect(status).toMatchObject({ schema: "@executioncontrolprotocol.test.session" })
    const help = await testTopicOperation.handler({}, ctx())
    expect(String(help)).toMatch(/ecp test/)
  }, 30_000)
})

describe("plugin authoring operations", () => {
  it("scaffolds, then check fails on an empty dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-op-new-"))
    const previous = process.cwd()
    process.chdir(dir)
    try {
      const created = (await pluginsNewOperation.handler({ name: "demo" }, ctx())) as { dir: string }
      expect(created.dir).toMatch(/plugin-demo$/)
      await expect(
        pluginsCheckOperation.handler({ dir: created.dir }, ctx())
      ).rejects.toBeInstanceOf(EcpCliError)
      await expect(
        pluginsBuildOperation.handler({ dir: join(dir, "missing") }, ctx())
      ).rejects.toBeInstanceOf(EcpCliError)
    } finally {
      process.chdir(previous)
    }
  })

  it("check succeeds for plugin-jsonata", async () => {
    const report = await pluginsCheckOperation.handler(
      { dir: join(repoRoot, "plugins", "plugin-jsonata") },
      ctx()
    )
    expect(report).toMatchObject({ ok: true })
  })
})

describe("discover / update / rollback", () => {
  it("discover maps registry hits and hides installed plugins", async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          objects: [
            {
              package: {
                name: "@executioncontrolprotocol/plugin-jsonata",
                version: "1.0.0",
                description: "jsonata",
                date: "2026-01-01",
              },
            },
            { package: { name: "acme-plugin", version: "0.1.0", date: "2026-02-01" } },
          ],
        }),
        { status: 200 }
      )) as typeof fetch
    try {
      const config = mockConfig([{ name: "acme-plugin", type: "user" }])
      const listed = (await discoverOperation.handler({ "sort-field": "name" }, ctx(config))) as {
        plugins: Array<{ name: string; firstParty: boolean }>
      }
      expect(listed.plugins.map((row) => row.name)).toEqual(["@executioncontrolprotocol/plugin-jsonata"])
      const all = (await discoverOperation.handler(
        { all: true, "sort-field": "date", "sort-order": "desc" },
        ctx(config)
      )) as { plugins: Array<{ name: string }> }
      expect(all.plugins[0]?.name).toBe("acme-plugin")
    } finally {
      globalThis.fetch = original
    }
  })

  it("discover wraps registry failures", async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch
    try {
      await expect(discoverOperation.handler({}, ctx())).rejects.toMatchObject({ code: "ECP_DISCOVER_FAILED" })
    } finally {
      globalThis.fetch = original
    }
  })

  it("update lists newer user plugins and can no-confirm install", async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/-/v1/search")) {
        return new Response(JSON.stringify({ objects: [] }), { status: 200 })
      }
      return new Response(JSON.stringify({ "dist-tags": { latest: "2.0.0" } }), { status: 200 })
    }) as typeof fetch
    const installed: string[] = []
    const config = mockConfig(
      [
        { name: "@executioncontrolprotocol/cli", type: "core", version: "1.0.0" },
        { name: "acme-plugin", type: "user", version: "1.0.0" },
      ],
      async (_id, argv) => {
        installed.push(String(argv?.[0]))
      }
    )
    try {
      const listed = (await updateOperation.handler({ list: true }, ctx(config))) as {
        plugins: Array<{ name: string; latest: string }>
      }
      expect(listed.plugins[0]).toMatchObject({ name: "acme-plugin", latest: "2.0.0" })
      const updated = (await updateOperation.handler({ "no-confirm": true }, ctx(config))) as {
        updated: string[]
      }
      expect(updated.updated).toEqual(["acme-plugin"])
      expect(installed[0]).toMatch(/acme-plugin@2.0.0/)
    } finally {
      globalThis.fetch = original
    }
  })

  it("rollback uninstalls user overlays of core plugins", async () => {
    const removed: string[] = []
    const config = mockConfig(
      [
        { name: "bundled", type: "core", version: "1.0.0" },
        { name: "bundled", type: "user", version: "1.1.0" },
      ],
      async (_id, argv) => {
        removed.push(String(argv?.[0]))
      }
    )
    const result = (await rollbackOperation.handler({}, ctx(config))) as { removed: string[] }
    expect(result.removed).toEqual(["bundled"])
  })
})

describe("secrets topic", () => {
  it("prints usage", async () => {
    const help = await configSecretsOperation.handler({}, ctx())
    expect(String(help)).toMatch(/ecp config secrets/)
  })

  it("add without --value on a non-TTY fails", async () => {
    await expect(configSecretsAddOperation.handler({ key: "demo" }, ctx())).rejects.toBeInstanceOf(EcpCliError)
  })
})

describe("lib helpers", () => {
  it("formatExtensionId and applyFormat without a format plugin", async () => {
    expect(formatExtensionId("mermaid")).toBe("@executioncontrolprotocol/format-mermaid")
    expect(formatExtensionId("format-toon")).toBe("@executioncontrolprotocol/format-toon")
    expect(formatExtensionId("@executioncontrolprotocol/format-json")).toBe(
      "@executioncontrolprotocol/format-json"
    )
    const { ecp, terminate } = await ecpFromEnvFlag(undefined)
    try {
      expect(await applyFormat(ecp, { a: 1 }, undefined)).toEqual({ a: 1 })
      await expect(applyFormat(ecp, { a: 1 }, "mermaid")).rejects.toThrow()
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  }, 30_000)

  it("readJsonFile and runWithCommandError", async () => {
    expect(commandErrorMessage(new Error("x"))).toBe("x")
    expect(commandErrorMessage("y")).toBe("y")
    const dir = await mkdtemp(join(tmpdir(), "ecp-json-"))
    const file = join(dir, "ok.json")
    await writeFile(file, JSON.stringify({ a: 1 }), "utf8")
    expect(await readJsonFile(file, "--input")).toEqual({ a: 1 })
    await expect(readJsonFile(join(dir, "missing.json"), "--input")).rejects.toThrow(/cannot read/)
    await writeFile(join(dir, "bad.json"), "{", "utf8")
    await expect(readJsonFile(join(dir, "bad.json"), "--input")).rejects.toThrow(/invalid JSON/)
    const errors: string[] = []
    await runWithCommandError(
      { error: (message: string) => errors.push(message) } as never,
      async () => {
        throw new Error("mapped")
      }
    )
    expect(errors[0]).toBe("mapped")
  })

  it("installed plugin snapshots and argv helpers", () => {
    const config = mockConfig([{ name: "a", type: "user", version: "1" }])
    expect(listInstalledPlugins(config)[0]?.name).toBe("a")
    expect(installedPluginNames(config).has("a")).toBe(true)
    expect(argvHasFlag(["--json"], "json")).toBe(true)
    expect(argvHasFlag(["--json=true"], "json")).toBe(true)
    expect(argvHasFlag(["-h"], "help", "h")).toBe(true)
    expect(argvHasFlag([], "json")).toBe(false)
    expect(argvFlagValue(["--env", "x.ts"], "env")).toBe("x.ts")
    expect(argvFlagValue(["--env=x.ts"], "env")).toBe("x.ts")
    expect(argvFlagValue(["--other"], "env")).toBeUndefined()
    expect(isFirstPartyPackage("@executioncontrolprotocol/plugin-jsonata")).toBe(true)
    expect(npmRegistryOrigin()).toMatch(/registry/)
    expect(wantsYes(["--yes"])).toBe(true)
  })

  it("npm registry helpers with a mocked fetch", async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/-/v1/search")) {
        return new Response(JSON.stringify({ objects: [{ package: { name: "x", version: "1" } }] }), {
          status: 200,
        })
      }
      if (init?.method === "HEAD") {
        if (url.endsWith("missing")) return new Response(null, { status: 404 })
        if (url.endsWith("legacy")) return new Response(null, { status: 405 })
        return new Response(null, { status: 200 })
      }
      if (url.endsWith("legacy")) return new Response("{}", { status: 200 })
      if (url.endsWith("gone")) return new Response("{}", { status: 500 })
      return new Response(JSON.stringify({ "dist-tags": { latest: "3.0.0" } }), { status: 200 })
    }) as typeof fetch
    try {
      expect(await searchEcpPlugins("jsonata")).toEqual([
        { name: "x", version: "1", description: undefined, date: undefined, keywords: undefined },
      ])
      expect(await npmPackageExists("@scope/name")).toBe(true)
      expect(await npmPackageExists("missing")).toBe(false)
      expect(await npmPackageExists("legacy")).toBe(true)
      expect(await npmLatestVersion("pkg")).toBe("3.0.0")
      expect(await npmLatestVersion("gone")).toBeUndefined()
    } finally {
      globalThis.fetch = original
    }
  })
})

describe("install, init, missing plugins", () => {
  it("writes a workflow file from ecp init", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-init-"))
    const previous = process.cwd()
    process.chdir(dir)
    try {
      const result = (await initOperation.handler({ name: "brief" }, ctx())) as { path: string }
      expect(result.path).toMatch(/brief\.ecp\.ts$/)
    } finally {
      process.chdir(previous)
    }
  })

  async function withRepoTemp(prefix: string, fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(repoRoot, prefix))
    try {
      await fn(dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  const jsonataSource = `import { workflow, step } from "@executioncontrolprotocol/core"
export default workflow("Needs jsonata").run([
  step("@executioncontrolprotocol/jsonata.transform", "T").with({ expression: "$" }).as("out"),
])
`

  it("validate of a jsonata workflow reports ECP_PLUGINS_MISSING without installing", async () => {
    await withRepoTemp("tmp-ecp-missing-", async (dir) => {
      const file = join(dir, "needs-jsonata.ecp.ts")
      await writeFile(file, jsonataSource, "utf8")
      const installed: string[] = []
      const config = mockConfig([], async (id, argv) => {
        installed.push(`${id}:${argv?.[0] ?? ""}`)
      })
      await expect(validateOperation.handler({ "workflow-path": file }, ctx(config))).rejects.toMatchObject({
        code: ECP_PLUGINS_MISSING,
      })
      expect(installed).toEqual([])
    })
  }, 30_000)

  it("run --json of a missing plugin does not call plugins:install", async () => {
    await withRepoTemp("tmp-ecp-missing-run-", async (dir) => {
      const file = join(dir, "needs-jsonata.ecp.ts")
      await writeFile(file, jsonataSource, "utf8")
      const installed: string[] = []
      const config = mockConfig([], async (id, argv) => {
        installed.push(`${id}:${argv?.[0] ?? ""}`)
      })
      await expect(
        runOperation.handler({ "workflow-path": file }, { ...ctx(config), json: true })
      ).rejects.toMatchObject({ code: ECP_PLUGINS_MISSING })
      expect(installed).toEqual([])
    })
  }, 30_000)

  it("install --yes installs the inferred package via plugins:install", async () => {
    await withRepoTemp("tmp-ecp-install-", async (dir) => {
      const file = join(dir, "needs-jsonata.ecp.ts")
      await writeFile(file, jsonataSource, "utf8")
      const installed: string[] = []
      const config = mockConfig([], async (id, argv) => {
        installed.push(`${id} ${argv?.[0] ?? ""}`)
      })
      await expect(
        installOperation.handler({ "workflow-path": file }, { ...ctx(config, ["--yes"]), json: false })
      ).rejects.toMatchObject({ code: ECP_PLUGINS_MISSING })
      expect(installed.some((row) => row.includes("plugin-jsonata"))).toBe(true)
    })
  }, 30_000)

  it("rejects a workflow that binds secrets", async () => {
    await withRepoTemp("tmp-ecp-secrets-bind-", async (dir) => {
      const file = join(dir, "bad.ecp.ts")
      await writeFile(
        file,
        `import { workflow, step, extension } from "@executioncontrolprotocol/core"
export default workflow("Bad secrets")
  .with([extension("@executioncontrolprotocol/secrets")])
  .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: 1 }).as("echo")])
`,
        "utf8"
      )
      await expect(runOperation.handler({ "workflow-path": file }, ctx())).rejects.toMatchObject({
        code: "ECP_BINDING_INVALID",
      })
    })
  }, 30_000)
})
