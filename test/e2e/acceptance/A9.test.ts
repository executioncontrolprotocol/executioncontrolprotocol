import { writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  createCliHome,
  fixturesRoot,
  parseJsonStdout,
  runEcp,
  stripVolatile,
  waitForHost,
} from "./support.js"

describe("A9 warm vs in-process parity for A1–A5 command set", () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it("retrieve, execute, validate, secrets/config, $script match warm and in-process", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const echoPath = path.join(fixturesRoot, "manifests/runs/echo.ecp.json")
    const invalid = path.join(fixturesRoot, "manifests/invalid/unknown-capability.ecp.json")
    const allFeatures = path.join(fixturesRoot, "manifests/acceptance/all-features.ecp.json")
    const inputPath = path.join(home, "in.json")
    writeFileSync(inputPath, `${JSON.stringify({ name: "parity" })}\n`)

    const scriptPath = path.join(home, "parity.js")
    writeFileSync(scriptPath, "1")
    const scriptManifest = path.join(home, "script.ecp.json")
    writeFileSync(
      scriptManifest,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "scripted",
            uses: "@executioncontrolprotocol/test.bounded",
            input: { text: { $script: { lang: "js", path: scriptPath } } },
            as: "out",
          },
        ],
      })}\n`,
    )

    const secretKey = `parity.secret.${Date.now()}`
    const secretValue = `parity-${Date.now()}`
    await runEcp(["secrets", "set", secretKey, "--json"], { env, stdin: secretValue })
    cleanups.push(async () => {
      await runEcp(["secrets", "unset", secretKey, "--json"], { env })
    })
    const configPath = path.join(home, "cfg.json")
    writeFileSync(
      configPath,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/parity",
        plugin: "@executioncontrolprotocol/test",
        values: { secret: { $secret: secretKey }, label: "p" },
        objectVersion: 0,
        updatedAt: "",
      })}\n`,
    )
    // Unique id so create works once; warm/in-process share storage — commit once before ops.
    await runEcp(
      ["commit", "--type", "config", "--action", "create", "--object", `@${configPath}`, "--json"],
      { env },
    )

    const defaultConfigPath = path.join(home, "default-config.json")
    writeFileSync(
      defaultConfigPath,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { label: "lab" },
        objectVersion: 0,
        updatedAt: "",
      })}\n`,
    )
    const defaultConfigCommit = await runEcp(
      ["commit", "--type", "config", "--action", "create", "--object", `@${defaultConfigPath}`, "--json"],
      { env },
    )
    expect(defaultConfigCommit.code, defaultConfigCommit.stderr + defaultConfigCommit.stdout).toBe(0)

    const ops = async (): Promise<unknown[]> => {
      const retrieve = parseJsonStdout(
        (
          await runEcp(["retrieve", "--type", "capability", "--query", "echo", "--json"], { env })
        ).stdout,
      )
      const executeEcho = parseJsonStdout(
        (await runEcp(["execute", echoPath, "--json"], { env })).stdout,
      )
      const executeAll = parseJsonStdout(
        (
          await runEcp(["execute", allFeatures, "--input", `@${inputPath}`, "--json"], { env })
        ).stdout,
      )
      const validate = parseJsonStdout(
        (await runEcp(["execute", invalid, "--validate", "--json"], { env })).stdout,
      )
      // Filter secrets to this test's key — the OS keychain is shared across e2e workers.
      const secretsRaw = parseJsonStdout<{ ok: boolean; data: { items: Array<{ key: string; source: string }> } }>(
        (await runEcp(["secrets", "list", "--json"], { env })).stdout,
      )
      const secretsList = {
        items: secretsRaw.data.items.filter((row) => row.key === secretKey),
      }
      const script = parseJsonStdout(
        (await runEcp(["execute", scriptManifest, "--json"], { env })).stdout,
      )
      return [retrieve, executeEcho, executeAll, validate, secretsList, script]
    }

    const cold = (await ops()).map(stripVolatile)

    delete env.ECP_NO_START_HOST
    const start = await runEcp(["host", "start", "--json"], { env, timeoutMs: 30_000 })
    expect(start.code).toBe(0)
    await waitForHost(home)

    const warm = (await ops()).map(stripVolatile)
    expect(warm).toEqual(cold)
  }, 300_000)
})
