import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  createCliHome,
  fixturesRoot,
  parseJsonStdout,
  runEcp,
  waitForHost,
} from "./support.js"

describe("cli json envelope", () => {
  it("wraps ECP-owned --json output in a single spec 06 envelope", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const invalid = path.join(fixturesRoot, "manifests/invalid/ref-unresolved.ecp.json")

    const down = await runEcp(["host", "status", "--json"], { env })
    expect(down.code).toBe(4)
    const downEnv = parseJsonStdout<{ ok: boolean; error: { code: string } }>(down.stdout)
    expect(downEnv.ok).toBe(false)
    expect(downEnv.error.code).toBe("ECP_HOST_UNAVAILABLE")

    const missingLog = await runEcp(["host", "logs", "--json"], { env })
    expect(missingLog.code).toBe(2)
    expect(parseJsonStdout<{ ok: boolean; error: { code: string } }>(missingLog.stdout).error.code).toMatch(/^ECP_/)

    const missingSecret = await runEcp(["secrets", "unset", `missing.${Date.now()}`, "--json"], { env })
    expect(missingSecret.code).toBe(2)
    expect(parseJsonStdout<{ ok: boolean; error: { code: string } }>(missingSecret.stdout).error.code).toBe(
      "ECP_NOT_FOUND",
    )

    const start = await runEcp(["host", "start", "--json"], { env, timeoutMs: 30_000 })
    expect(start.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { url: string } }>(start.stdout).data.url).toMatch(/^http/)
    await waitForHost(home)

    const status = await runEcp(["host", "status", "--json"], { env })
    expect(status.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { port: number } }>(status.stdout).data.port).toBeGreaterThan(0)

    const secrets = await runEcp(["secrets", "list", "--json"], { env })
    expect(secrets.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { items: unknown[] } }>(secrets.stdout).data.items).toBeDefined()

    const formatters = await runEcp(["retrieve", "--type", "formatter", "--json"], { env })
    expect(formatters.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: unknown }>(formatters.stdout).ok).toBe(true)

    const plugins = await runEcp(["plugins", "--json"], { env })
    expect(plugins.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { items: unknown[] } }>(plugins.stdout).data.items).toBeDefined()

    const pluginUpdate = await runEcp(["plugins", "update", "--json"], { env })
    expect(pluginUpdate.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { action: string } }>(pluginUpdate.stdout).data.action).toBe("update")

    const pluginInspect = await runEcp(["plugins", "inspect", "test", "--json"], { env })
    expect(pluginInspect.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { items: unknown[] } }>(pluginInspect.stdout).data.items).toBeDefined()

    const schema = await runEcp(["schema", "--print", "--json"], { env })
    expect(schema.code).toBe(0)
    const schemaEnv = parseJsonStdout<{ ok: boolean; data: { path: string; schema: Record<string, unknown> } }>(
      schema.stdout,
    )
    expect(schemaEnv.ok).toBe(true)
    expect(schemaEnv.data.schema).toBeTypeOf("object")
    expect(schema.stdout.trim().split("\n").length).toBe(1)

    const app = await runEcp(["app", "--no-open", "--json"], { env })
    expect(app.code).toBe(0)
    expect(parseJsonStdout<{ ok: boolean; data: { url: string } }>(app.stdout).data.url).toContain("/app/#")

    const validate = await runEcp(["execute", invalid, "--validate", "--json"], { env })
    expect(validate.code).toBe(2)
    const validateEnv = parseJsonStdout<{ ok: boolean; error: { code: string } }>(validate.stdout)
    expect(validateEnv.ok).toBe(false)
    expect(validateEnv.error.code).toMatch(/^ECP_/)

    await runEcp(["host", "stop", "--force", "--json"], { env })
  }, 120_000)
})