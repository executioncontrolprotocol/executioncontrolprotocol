import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { createCliHome, fixturesRoot, parseJsonStdout, runEcp, waitForHost } from "./support.js"

describe("cli path draft", () => {
  it("retrieve and draft commit by path with string ifVersion", async () => {
    const { home, env } = await createCliHome()
    const start = await runEcp(["host", "start", "--json"], { env, timeoutMs: 30_000 })
    expect(start.code).toBe(0)
    await waitForHost(home)
    const work = path.join(home, "work")
    mkdirSync(work, { recursive: true })
    const execFile = path.join(work, "demo.ecp.json")
    writeFileSync(execFile, readFileSync(path.join(fixturesRoot, "manifests/runs/echo.ecp.json"), "utf8"))
    const retrieved = await runEcp(
      ["retrieve", "--type", "execution", "--path", "./demo.ecp.json", "--json"],
      { env, cwd: work },
    )
    expect(retrieved.code).toBe(0)
    const body = parseJsonStdout<{ ok: boolean; data: { item: { version: string } } }>(retrieved.stdout)
    expect(body.ok).toBe(true)
    const version = body.data.item.version
    expect(typeof version).toBe("string")

    const next = {
      ...JSON.parse(readFileSync(execFile, "utf8")),
      execution: { id: "demo", label: "Drafted" },
    }
    const objectFile = path.join(work, "next.json")
    writeFileSync(objectFile, `${JSON.stringify(next, null, 2)}\n`)
    const committed = await runEcp(
      [
        "commit",
        "--type",
        "execution",
        "--action",
        "update",
        "--path",
        "./demo.ecp.json",
        "--draft",
        "--if-version",
        version,
        "--object",
        `@${objectFile}`,
        "--json",
      ],
      { env, cwd: work },
    )
    expect(committed.code).toBe(0)
    const commitBody = parseJsonStdout<{ ok: boolean; data: { version: string } }>(committed.stdout)
    expect(commitBody.ok).toBe(true)
    expect(typeof commitBody.data.version).toBe("string")
    expect(readFileSync(execFile, "utf8")).toContain("Drafted")

    const stale = await runEcp(
      [
        "commit",
        "--type",
        "execution",
        "--action",
        "update",
        "--path",
        "./demo.ecp.json",
        "--if-version",
        version,
        "--object",
        `@${objectFile}`,
        "--json",
      ],
      { env, cwd: work },
    )
    expect(stale.code).toBe(2)
    const staleBody = parseJsonStdout<{ ok: boolean; error: { code: string } }>(stale.stdout)
    expect(staleBody.error.code).toBe("ECP_VERSION_CONFLICT")
  }, 120_000)
})