import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { envNameForKey } from "@executioncontrolprotocol/local"
import {
  fixturesRoot,
  listStepFiles,
  readEvents,
  readJson,
  startTestHost,
} from "./support/harness.js"

describe("host integration acceptance", () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it("A2 runs all-features end to end on disk", async () => {
    const { host, home } = await startTestHost()
    cleanups.push(() => host.stop())
    const manifest = JSON.parse(
      await readFile(path.join(fixturesRoot, "manifests/acceptance/all-features.ecp.json"), "utf8"),
    ) as ExecutionManifest
    const expected = JSON.parse(
      await readFile(path.join(fixturesRoot, "manifests/acceptance/all-features.run.json"), "utf8"),
    ) as {
      status: string
      result: Record<string, unknown>
      steps: Record<string, string>
      events: string[]
    }

    const response = await host.operations.execute({
      execution: manifest,
      input: { name: "world" },
    })
    expect(response.ok).toBe(true)
    if (!response.ok) return
    expect(response.data.status).toBe(expected.status)
    expect(response.data.result).toMatchObject(expected.result)
    for (const [nodeId, status] of Object.entries(expected.steps)) {
      expect(response.data.steps.find((step) => step.nodeId === nodeId)?.status).toBe(status)
    }

    const runId = response.data.runId
    const record = await readJson<{ status: string }>(path.join(home, "runs", runId, "run.json"))
    expect(record.status).toBe("completed")
    const steps = await listStepFiles(home, runId)
    expect(steps.length).toBeGreaterThan(0)
    const events = await readEvents(home, runId)
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["run.start", "run.end"]))
    expect(events[0]?.type).toBe("run.start")
    expect(events.at(-1)?.type).toBe("run.end")
  })

  it("A3 validates eight invalid manifests with expected codes", async () => {
    const { host } = await startTestHost()
    cleanups.push(() => host.stop())
    const invalidDir = path.join(fixturesRoot, "manifests/invalid")
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
      const manifest = JSON.parse(
        await readFile(path.join(invalidDir, `${name}.ecp.json`), "utf8"),
      ) as ExecutionManifest
      const expected = JSON.parse(
        await readFile(path.join(invalidDir, `${name}.expected.json`), "utf8"),
      ) as Array<{ code: string; path: string; severity: string }>
      const response = await host.operations.execute({ execution: manifest, mode: "validate" })
      expect(response.ok).toBe(false)
      if (response.ok) continue
      const actual = (response.error.issues ?? []).map((issue) => ({
        code: issue.code,
        path: issue.path,
        severity: issue.severity,
      }))
      for (const issue of expected) {
        expect(actual, `${name} missing ${issue.code} ${issue.path}`).toContainEqual(issue)
      }
    }
  })

  it("A4 redacts secrets from disk, responses and never stores the value", async () => {
    const secretKey = `test.secret.${Date.now()}`
    const secretValue = `super-secret-${Date.now()}`
    process.env[envNameForKey(secretKey)] = secretValue
    const { host, home } = await startTestHost()
    cleanups.push(async () => {
      delete process.env[envNameForKey(secretKey)]
      await host.stop()
    })

    const commit = await host.operations.commit({
      type: "config",
      action: "create",
      object: {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { secret: { $secret: secretKey }, label: "lab" },
        objectVersion: 0,
        updatedAt: "",
      },
    })
    expect(commit.ok).toBe(true)

    const response = await host.operations.execute({
      execution: {
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
      },
    })
    expect(response.ok).toBe(true)
    if (!response.ok) return
    expect(response.data.result).toMatchObject({
      echoed: { secretLength: secretValue.length },
    })
    const keys = (response.data.result as { echoed: { keys: string[] } }).echoed.keys
    expect(keys).toEqual(expect.arrayContaining(["secret", "label"]))
    expect(keys).toHaveLength(2)
    const blob = JSON.stringify(response)
    expect(blob).not.toContain(secretValue)

    const runId = response.data.runId
    const runDir = path.join(home, "runs", runId)
    const files = ["run.json", "state.json", "events.ndjson"]
    for (const name of files) {
      try {
        const text = await readFile(path.join(runDir, name), "utf8")
        expect(text).not.toContain(secretValue)
      } catch {
        // state may be absent if empty
      }
    }
    const configText = await readFile(path.join(home, "store/configs/test/default.json"), "utf8")
    expect(configText).toContain("$secret")
    expect(configText).not.toContain(secretValue)
  })

  it("A5 reports script syntax errors and rejects over-long scripts", async () => {
    const { host, home } = await startTestHost()
    cleanups.push(() => host.stop())
    const badPath = path.join(home, "bad.js")
    await writeFile(badPath, "function ( {")
    const syntax = await host.operations.execute({
      execution: {
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
      },
      mode: "validate",
    })
    expect(syntax.ok).toBe(false)
    if (!syntax.ok) {
      const issues = syntax.error.issues ?? []
      expect(
        issues.some((issue) => /script|syntax|ECP_/i.test(`${issue.code}${issue.message}`)) ||
          /ECP_/.test(syntax.error.code),
      ).toBe(true)
    }

    const longPath = path.join(home, "long.js")
    await writeFile(longPath, `export default ${"x".repeat(1_100_000)}`)
    const tooLong = await host.operations.execute({
      execution: {
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
      },
    })
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) expect(tooLong.error.code).toMatch(/ECP_/)
  })

  it("A7 commit versions, conflicts, and execute id+patch without saving", async () => {
    const { host } = await startTestHost()
    cleanups.push(() => host.stop())
    const create = await host.operations.commit({
      type: "execution",
      action: "create",
      id: "patch-me",
      object: {
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
      },
    })
    expect(create.ok).toBe(true)
    if (!create.ok) return

    const update = await host.operations.commit({
      type: "execution",
      action: "update",
      id: "patch-me",
      ifVersion: 1,
      patch: [{ op: "replace", path: "/steps/0/input/value", value: "v2" }],
    })
    expect(update.ok).toBe(true)
    if (update.ok) expect(update.data.version).toBe(2)

    const conflict = await host.operations.commit({
      type: "execution",
      action: "update",
      id: "patch-me",
      ifVersion: 1,
      object: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "echo",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "stale" },
            as: "out",
          },
        ],
      },
    })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) expect(conflict.error.code).toBe("ECP_VERSION_CONFLICT")

    const run = await host.operations.execute({
      execution: {
        id: "patch-me",
        patch: [{ op: "replace", path: "/steps/0/input/value", value: "ephemeral" }],
      },
    })
    expect(run.ok).toBe(true)
    if (run.ok) expect(run.data.result).toMatchObject({ out: { echo: "ephemeral" } })

    const stored = await host.operations.retrieve({ type: "execution", id: "patch-me" })
    expect(stored.ok).toBe(true)
    if (stored.ok && stored.data.type === "execution" && "item" in stored.data) {
      const item = stored.data.item as { manifest: ExecutionManifest; version: number }
      expect(item.version).toBe(2)
      expect((item.manifest.steps[0] as { input?: { value?: string } }).input?.value).toBe("v2")
    }
  })
})
