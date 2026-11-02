import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  capabilityFor,
  defineExtension,
  workflow,
  step,
  secrets,
  extension,
  testExtension,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import {
  environment,
  NODE_ENVIRONMENT_ID,
  listRunJournals,
  readRunJournal,
  readStepJournal,
  writeInvokeJournal,
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

    const env = environment(NODE_ENVIRONMENT_ID, "journal-test").with([
      extension(testExtension),
    ])
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

  it("failed step files store diagnostics, output, and run.json stepId", async () => {
    class HttpErr extends Error {
      status = 400
      bodyText = "super-secret-token"
      output = { token: "super-secret-token" }

      constructor() {
        super("HTTP 400")
        this.name = "HttpErr"
      }
    }

    const dir = await mkdtemp(join(tmpdir(), "ecp-journal-fail-"))
    dirs.push(dir)
    process.env.ECP_RUNS_DIR = dir
    setMemorySecret("TOKEN", "super-secret-token")
    recordResolvedSecret("TOKEN", "super-secret-token")

    const boom = defineExtension("@executioncontrolprotocol", "journal-fail")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/journal-fail", "call")
          .withInput(z.object({}))
          .withOutput(z.object({ token: z.string() }))
          .withHandler(async () => {
            throw new HttpErr()
          }),
      ])
      .build()

    const env = environment(NODE_ENVIRONMENT_ID, "journal-fail").with([extension(boom)])
    const ecp = await env.init()
    try {
      const manifest = workflow("fail")
        .run([
          step("@executioncontrolprotocol/journal-fail.call", "Call").id("call").as("out"),
        ])
        .toManifest()
      const result = await ecp.run(manifest, {
        journal: { workflowPath: "fail.ecp.ts", workflowHash: "abc", directory: dir },
      })
      expect(result.run.status).toBe("failed")
      const run = await readRunJournal(result.run.id, dir)
      expect(run.status).toBe("failed")
      expect(run.error?.stepId).toBe("call")
      expect(run.error?.code).toBe("ECP_STEP_FAILED")
      expect(run.error?.details).toMatchObject({ name: "HttpErr", status: 400 })
      expect(JSON.stringify(run.error)).not.toContain("super-secret-token")
      const stepDoc = await readStepJournal(result.run.id, "call", dir)
      expect(stepDoc.status).toBe("failed")
      expect(stepDoc.output).toEqual({ token: secretMarker("TOKEN") })
      expect(stepDoc.diagnostics?.[0]?.details).toMatchObject({ name: "HttpErr", status: 400 })
      expect(JSON.stringify(stepDoc)).not.toContain("super-secret-token")
    } finally {
      await ecp.terminate()
    }
  })

  it("writeInvokeJournal stores diagnostics and output on failure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-journal-invoke-"))
    dirs.push(dir)
    process.env.ECP_RUNS_DIR = dir
    const runId = await writeInvokeJournal({
      capabilityId: "@executioncontrolprotocol/test.echo",
      input: { value: "x" },
      result: { echo: "x" },
      success: false,
      diagnostics: [
        {
          code: "ECP_STEP_FAILED",
          message: "HTTP 400",
          severity: "error",
          details: { status: 400, bodyText: "nope" },
        },
      ],
    })
    const run = await readRunJournal(runId, dir)
    expect(run.status).toBe("failed")
    expect(run.error?.stepId).toBe("invoke")
    expect(run.error?.details).toEqual({ status: 400, bodyText: "nope" })
    const stepDoc = await readStepJournal(runId, "invoke", dir)
    expect(stepDoc.output).toEqual({ echo: "x" })
    expect(stepDoc.diagnostics?.[0]?.code).toBe("ECP_STEP_FAILED")
  })
})
