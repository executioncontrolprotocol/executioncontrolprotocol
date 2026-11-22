import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  createCliHome,
  fixturesRoot,
  parseJsonStdout,
  pluginTestRoot,
  runEcp,
  seedPluginLink,
  waitForHost,
} from "./support.js"

describe("cli e2e commands", () => {
  it("retrieve help renders an example", async () => {
    assertCliBuilt()
    const { env } = await createCliHome({ linkPluginTest: false })
    const result = await runEcp(["retrieve", "--help"], { env })
    expect(result.code).toBe(0)
    expect(result.stdout + result.stderr).toMatch(/retrieve --type capability --query echo/)
  })

  it("mcp start help is available", async () => {
    assertCliBuilt()
    const { env } = await createCliHome({ linkPluginTest: false })
    const result = await runEcp(["mcp", "start", "--help"], { env })
    expect(result.code).toBe(0)
    expect(result.stdout + result.stderr).toMatch(/MCP relay/i)
  })

  it("host status exits 4 when down; start/status/stop/logs round-trip", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const down = await runEcp(["host", "status", "--json"], { env })
    expect(down.code).toBe(4)

    const start = await runEcp(["host", "start", "--json"], { env, timeoutMs: 30_000 })
    expect(start.code).toBe(0)
    const started = parseJsonStdout<{ ok: boolean; data: { url: string; hostPid: number } }>(start.stdout)
    expect(started.data.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    await waitForHost(home)

    const status = await runEcp(["host", "status", "--json"], { env })
    expect(status.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { port: number } }>(status.stdout).data.port).toBeGreaterThan(0)

    const logs = await runEcp(["host", "logs", "--lines", "5", "--json"], { env })
    expect(logs.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { path: string } }>(logs.stdout).data.path).toContain("host.log")

    const stop = await runEcp(["host", "stop", "--force", "--json"], { env })
    expect(stop.code).toBe(0)
  }, 90_000)

  it("A1 retrieve finds test.echo via linked plugin-test", async () => {
    assertCliBuilt()
    const { env } = await createCliHome()
    const query = await runEcp(["retrieve", "--type", "capability", "--query", "echo", "--json"], { env })
    expect(query.code).toBe(0)
    const listed = parseJsonStdout<{
      ok: boolean
      data: { items: Array<{ id: string }> }
    }>(query.stdout)
    expect(listed.ok).toBe(true)
    expect(listed.data.items.some((item) => item.id.includes("test.echo"))).toBe(true)

    const id = listed.data.items.find((item) => item.id.includes("test.echo"))!.id
    const one = await runEcp(["retrieve", "--type", "capability", "--id", id, "--json"], { env })
    expect(one.code).toBe(0)
    const detail = parseJsonStdout<{ ok: boolean; data: { item?: { accepts?: unknown; returns?: unknown } } }>(
      one.stdout,
    )
    expect(detail.ok).toBe(true)
    const item = detail.data.item ?? (detail.data as { accepts?: unknown; returns?: unknown })
    expect(item.accepts ?? (detail.data as { accepts?: unknown }).accepts).toBeDefined()
  }, 60_000)

  it("execute path / validate / no-wait / out and human snapshots", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const echoPath = path.join(fixturesRoot, "manifests/runs/echo.ecp.json")

    const human = await runEcp(["execute", echoPath], { env })
    expect(human.code).toBe(0)
    expect(human.stdout).toMatch(/echo\s+completed/)
    expect(human.stdout).toMatch(/hi/)

    const validate = await runEcp(["execute", echoPath, "--validate", "--json"], { env })
    expect(validate.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean }>(validate.stdout).ok).toBe(true)

    const invalid = path.join(fixturesRoot, "manifests/invalid/unknown-capability.ecp.json")
    const failValidate = await runEcp(["execute", invalid, "--validate", "--json"], { env })
    expect(failValidate.code).toBe(2)
    const failEnvelope = parseJsonStdout<{ ok: boolean }>(failValidate.stdout)
    expect(failEnvelope.ok).toBe(false)

    const failHuman = await runEcp(["execute", invalid, "--validate"], { env })
    expect(failHuman.code).toBe(2)
    expect(failHuman.stdout + failHuman.stderr).toMatch(/ECP_/)

    const outFile = path.join(home, "out.json")
    const withOut = await runEcp(["execute", echoPath, "--out", outFile, "--json"], { env })
    expect(withOut.code).toBe(0)
    expect(withOut.stdout).toMatch(/wrote/)
    expect(JSON.parse(readFileSync(outFile, "utf8")).status).toBe("completed")

    const asyncRun = await runEcp(["execute", echoPath, "--no-wait", "--json"], { env })
    expect(asyncRun.code).toBe(0)
    const started = parseJsonStdout<{ ok: boolean; data: { runId: string; status: string } }>(asyncRun.stdout)
    expect(started.ok).toBe(true)
    expect(started.data.runId).toBeTruthy()

    const runGet = await runEcp(
      ["retrieve", "--type", "run", "--id", started.data.runId, "--json"],
      { env },
    )
    expect(runGet.code).toBe(0)
  }, 90_000)

  it("A3 validate invalid fixtures through CLI", async () => {
    assertCliBuilt()
    const { env } = await createCliHome()
    const names = [
      "schema-empty-steps",
      "unknown-capability",
      "duplicate-id",
      "expr-syntax",
      "ref-unresolved",
      "plugins-missing",
      "mode-without-as",
      "default-arm-not-last",
    ]
    for (const name of names) {
      const file = path.join(fixturesRoot, "manifests/invalid", `${name}.ecp.json`)
      const expected = JSON.parse(
        readFileSync(path.join(fixturesRoot, "manifests/invalid", `${name}.expected.json`), "utf8"),
      ) as Array<{ code: string; path: string }>
      const result = await runEcp(["execute", file, "--validate", "--json"], { env })
      expect(result.code, name).toBe(2)
      const envelope = parseJsonStdout<{
        ok: false
        error: { issues?: Array<{ code: string; path: string }> }
      }>(result.stdout)
      expect(envelope.ok).toBe(false)
      const actual = (envelope.error.issues ?? []).map((row) => ({ code: row.code, path: row.path }))
      expect(actual, name).toEqual(expected.map((issue) => ({ code: issue.code, path: issue.path })))
    }
  }, 120_000)

  it("A4 secrets set via stdin, config commit, redaction", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const secretKey = `cli.secret.${Date.now()}`
    const secretValue = `super-secret-${Date.now()}`
    const set = await runEcp(["config", "secrets", "set", secretKey, "--json"], {
      env,
      stdin: secretValue,
    })
    expect(set.code).toBe(0)
    expect(set.stdout).not.toContain(secretValue)
    expect(set.stderr).not.toContain(secretValue)

    const list = await runEcp(["config", "secrets", "list", "--json"], { env })
    expect(list.code).toBe(0)
    const listed = parseJsonStdout<{ ok: boolean; data: { items: Array<{ key: string; source: string }> } }>(
      list.stdout,
    )
    expect(
      listed.data.items.some((row) => row.key === secretKey && (row.source === "keychain" || row.source === "env")),
    ).toBe(
      true,
    )

    const configObject = {
      schema: "@executioncontrolprotocol.config",
      version: "1.0",
      id: "test/default",
      plugin: "@executioncontrolprotocol/test",
      values: { secret: { $secret: secretKey }, label: "lab" },
      objectVersion: 0,
      updatedAt: "",
    }
    const configPath = path.join(home, "config-object.json")
    writeFileSync(configPath, `${JSON.stringify(configObject)}\n`)
    const commit = await runEcp(
      ["commit", "--type", "config", "--action", "create", "--object", `@${configPath}`, "--json"],
      { env },
    )
    expect(commit.code).toBe(0)

    const execPath = path.join(home, "config-echo.ecp.json")
    writeFileSync(
      execPath,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "cfg",
            uses: "@executioncontrolprotocol/test.config-echo",
            input: {},
            as: "echoed",
          },
        ],
      })}\n`,
    )
    const run = await runEcp(["execute", execPath, "--json"], { env })
    expect(run.code).toBe(0)
    expect(run.stdout).not.toContain(secretValue)
    const envelope = parseJsonStdout<{ ok: boolean; data: { result?: unknown; runId: string } }>(run.stdout)
    expect(envelope.ok).toBe(true)
    expect(JSON.stringify(envelope.data.result)).not.toContain(secretValue)

    const missing = await runEcp(["config", "secrets", "unset", `missing.${Date.now()}`, "--json"], { env })
    expect(missing.code).toBe(2)

    await runEcp(["config", "secrets", "unset", secretKey, "--json"], { env })
  }, 90_000)

  it("A5 $script syntax and over-long via CLI", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const badPath = path.join(home, "bad.js")
    writeFileSync(badPath, "function ( {")
    const syntaxManifest = path.join(home, "syntax.ecp.json")
    writeFileSync(
      syntaxManifest,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "script",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: { $script: { path: badPath } } },
            as: "out",
          },
        ],
      })}\n`,
    )
    const syntax = await runEcp(["execute", syntaxManifest, "--validate", "--json"], { env })
    expect(syntax.code).not.toBe(0)

    const longPath = path.join(home, "long.js")
    writeFileSync(longPath, `export default ${"x".repeat(1_100_000)}`)
    const longManifest = path.join(home, "long.ecp.json")
    writeFileSync(
      longManifest,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "script",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: { $script: { path: longPath } } },
            as: "out",
          },
        ],
      })}\n`,
    )
    const tooLong = await runEcp(["execute", longManifest, "--json"], { env })
    expect(tooLong.code).not.toBe(0)
    expect(tooLong.stdout + tooLong.stderr).toMatch(/ECP_/)
  }, 90_000)

  it("A7 commit versioning and execute id through CLI", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const objectPath = path.join(home, "exec.json")
    writeFileSync(
      objectPath,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { id: "patch-me" },
        steps: [
          {
            id: "echo",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "v1" },
            as: "out",
          },
        ],
      })}\n`,
    )
    const create = await runEcp(
      ["commit", "--type", "execution", "--action", "create", "--id", "patch-me", "--object", `@${objectPath}`, "--json"],
      { env },
    )
    expect(create.code).toBe(0)

    const patchPath = path.join(home, "patch.json")
    writeFileSync(
      patchPath,
      `${JSON.stringify([{ op: "replace", path: "/steps/0/input/value", value: "v2" }])}\n`,
    )
    const update = await runEcp(
      [
        "commit",
        "--type",
        "execution",
        "--action",
        "update",
        "--id",
        "patch-me",
        "--if-version",
        "1",
        "--patch",
        `@${patchPath}`,
        "--json",
      ],
      { env },
    )
    expect(update.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { version: number } }>(update.stdout).data.version).toBe(2)

    const conflict = await runEcp(
      [
        "commit",
        "--type",
        "execution",
        "--action",
        "update",
        "--id",
        "patch-me",
        "--if-version",
        "1",
        "--object",
        `@${objectPath}`,
        "--json",
      ],
      { env },
    )
    expect(conflict.code).toBe(2)
    expect(parseJsonStdout<{ ok: false; error: { code: string } }>(conflict.stdout).error.code).toBe(
      "ECP_VERSION_CONFLICT",
    )

    const byId = await runEcp(["execute", "patch-me", "--json"], { env })
    expect(byId.code).toBe(0)
    const run = parseJsonStdout<{ ok: boolean; data: { result?: { out?: { echo?: string } } } }>(byId.stdout)
    expect(run.data.result?.out?.echo).toBe("v2")
  }, 90_000)

  it("retrieve schema prints path; retired schema command fails; app --no-open prints URL", async () => {
    assertCliBuilt()
    const { home, env, dataDir } = await createCliHome()
    const schemaHuman = await runEcp(["retrieve", "--type", "schema"], { env })
    expect(schemaHuman.code).toBe(0)
    expect(schemaHuman.stdout.trim()).toContain("execution.schema.json")
    const schemaJson = await runEcp(["retrieve", "--type", "schema", "--json"], { env })
    expect(schemaJson.code).toBe(0)
    expect(
      parseJsonStdout<{ ok: boolean; data: { item: { path: string } } }>(schemaJson.stdout).data.item.path,
    ).toContain("execution.schema.json")
    const retiredSchema = await runEcp(["schema"], { env })
    expect(retiredSchema.code).not.toBe(0)
    const retiredSecrets = await runEcp(["secrets", "list"], { env })
    expect(retiredSecrets.code).not.toBe(0)

    const start = await runEcp(["host", "start", "--json"], { env, timeoutMs: 30_000 })
    expect(start.code).toBe(0)
    await waitForHost(home)

    const app = await runEcp(["app", "--no-open", "--json"], { env })
    expect(app.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { url: string } }>(app.stdout).data.url).toMatch(/\/app\/#/)

    const bare = path.join(home, "bare-plugin")
    mkdirSync(bare, { recursive: true })
    writeFileSync(
      path.join(bare, "package.json"),
      `${JSON.stringify({
        name: "bare-plugin",
        version: "1.0.0",
        oclif: {},
      })}\n`,
    )
    const link = await runEcp(["plugins", "link", bare, "--no-install", "--json"], { env, timeoutMs: 60_000 })
    expect(link.code).toBe(2)
    const linkEnv = parseJsonStdout<{ ok: boolean; error: { code: string; suggestions?: string[] } }>(link.stdout)
    expect(linkEnv.error.code).toBe("ECP_MANIFEST_INVALID")
    expect(linkEnv.error.suggestions?.join(" ")).toContain("ecp-plugin-manifest")
    void dataDir
    void pluginTestRoot
    void seedPluginLink
  }, 120_000)

  it("retrieve schema in-process writes plugin editor file after plugins link", async () => {
    assertCliBuilt()
    const { home, env, dataDir } = await createCliHome({ linkPluginTest: false })
    const rootOnly = await runEcp(["retrieve", "--type", "schema", "--json"], { env })
    expect(rootOnly.code).toBe(0)
    const rootPath = parseJsonStdout<{ ok: boolean; data: { item: { path: string } } }>(rootOnly.stdout).data.item.path
    expect(existsSync(rootPath)).toBe(true)

    const link = await runEcp(["plugins", "link", pluginTestRoot, "--json"], { env, timeoutMs: 120_000 })
    expect(link.code).toBe(0)

    const pluginSchema = await runEcp(
      ["retrieve", "--type", "schema", "--id", "@executioncontrolprotocol/test", "--json"],
      { env },
    )
    expect(pluginSchema.code).toBe(0)
    const pluginPath = parseJsonStdout<{ ok: boolean; data: { item: { path: string } } }>(pluginSchema.stdout).data.item
      .path
    expect(existsSync(pluginPath)).toBe(true)
    void home
    void dataDir
  }, 120_000)

  it("warm host retrieve schema after plugins link returns existing plugin editor path", async () => {
    assertCliBuilt()
    const { home, env, dataDir } = await createCliHome({ linkPluginTest: false, autoStartHost: true })
    const start = await runEcp(["host", "start", "--json"], { env, timeoutMs: 30_000 })
    expect(start.code).toBe(0)
    await waitForHost(home)

    const link = await runEcp(["plugins", "link", pluginTestRoot, "--json"], { env, timeoutMs: 120_000 })
    expect(link.code).toBe(0)

    await expect
      .poll(
        async () => {
          const pluginSchema = await runEcp(
            ["retrieve", "--type", "schema", "--id", "@executioncontrolprotocol/test", "--json"],
            { env, timeoutMs: 60_000 },
          )
          if (pluginSchema.code !== 0) return undefined
          const pluginPath = parseJsonStdout<{ ok: boolean; data: { item: { path: string } } }>(pluginSchema.stdout)
            .data.item.path
          return existsSync(pluginPath) ? pluginPath : undefined
        },
        { timeout: 120_000, interval: 500 },
      )
      .toBeTypeOf("string")
    await runEcp(["host", "stop", "--force", "--json"], { env })
    void dataDir
  }, 180_000)
})
