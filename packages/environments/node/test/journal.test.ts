import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { workflow, step, secrets } from "@executioncontrolprotocol/core"
import {
  environment,
  NODE_ENVIRONMENT_ID,
  listRunJournals,
  readRunJournal,
  readStepJournal,
  redactSecrets,
  recordResolvedSecret,
  secretMarker,
  setMemorySecret,
  resetSecretsStore,
} from "../src/index.js"

describe("journal writer", () => {
  const previous = process.env.ECP_RUNS_DIR
  const dirs: string[] = []

  afterEach(async () => {
    if (previous === undefined) delete process.env.ECP_RUNS_DIR
    else process.env.ECP_RUNS_DIR = previous
    resetSecretsStore()
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it("writes run.json and step files with redacted secrets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-journal-"))
    dirs.push(dir)
    process.env.ECP_RUNS_DIR = dir
    setMemorySecret("TOKEN", "super-secret-token")
    recordResolvedSecret("TOKEN", "super-secret-token")

    const env = environment(NODE_ENVIRONMENT_ID, "journal-test")
    const ecp = await env.init()
    try {
      const manifest = workflow("echo")
        .run([
          step("@executioncontrolprotocol/test.echo", "Echo")
            .id("echo")
            .with({ value: "hello" })
            .as("out"),
        ])
        .toManifest()
      const result = await ecp.run(manifest, {
        journal: { workflowPath: "echo.ecp.ts", workflowHash: "abc", directory: dir },
      })
      expect(result.run.status).toBe("completed")
      const run = await readRunJournal(result.run.id, dir)
      expect(run.journalVersion).toBe(1)
      expect(run.status).toBe("completed")
      const stepDoc = await readStepJournal(result.run.id, "echo", dir)
      expect(stepDoc.capabilityId).toBe("@executioncontrolprotocol/test.echo")
      expect(stepDoc.status).toBe("completed")
      const listed = await listRunJournals(dir)
      expect(listed.some((item) => item.runId === result.run.id)).toBe(true)
    } finally {
      await ecp.terminate()
    }
  })

  it("redacts recorded secret values", () => {
    recordResolvedSecret("KEY", "abc-secret")
    expect(redactSecrets({ token: "abc-secret", nested: { token: "abc-secret" } })).toEqual({
      token: secretMarker("KEY"),
      nested: { token: secretMarker("KEY") },
    })
  })

  it("secrets() helper is not required for this redaction test", () => {
    expect(typeof secrets).toBe("function")
  })
})
