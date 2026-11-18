import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  createCliHome,
  parseJsonStdout,
  runEcp,
} from "./support.js"

describe("A4 secrets and redaction", () => {
  it("secrets set via stdin; config $secret; value absent from run files and JSON", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const secretKey = `test.secret.${Date.now()}`
    const secretValue = `acceptance-secret-${Date.now()}`

    const set = await runEcp(["config", "secrets", "set", secretKey, "--json"], {
      env,
      stdin: secretValue,
    })
    expect(set.code).toBe(0)
    expect(set.stdout).not.toContain(secretValue)
    expect(set.stderr).not.toContain(secretValue)

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
    expect(commit.code, commit.stderr + commit.stdout).toBe(0)
    expect(commit.stdout).not.toContain(secretValue)

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
    const envelope = parseJsonStdout<{
      ok: boolean
      data: { runId: string; result?: { echoed?: { secretLength?: number } } }
    }>(run.stdout)
    expect(envelope.ok).toBe(true)
    expect(envelope.data.result?.echoed?.secretLength).toBe(secretValue.length)
    expect(JSON.stringify(envelope.data)).not.toContain(secretValue)

    const runDir = path.join(home, "runs", envelope.data.runId)
    for (const name of ["run.json", "events.ndjson", "state.json"]) {
      const file = path.join(runDir, name)
      if (!existsSync(file)) continue
      expect(readFileSync(file, "utf8")).not.toContain(secretValue)
    }

    const configStored = readFileSync(path.join(home, "store/configs/test/default.json"), "utf8")
    expect(configStored).toContain("$secret")
    expect(configStored).not.toContain(secretValue)

    await runEcp(["config", "secrets", "unset", secretKey, "--json"], { env })
  }, 90_000)
})
