import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { defineExtension, definePolicy, capabilityFor, hook, extension } from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { z } from "zod"
import { toCommands } from "../src/to-commands.js"
import { defineOperation } from "../src/define-operation.js"
import { EcpCommand } from "../src/ecp-command.js"
import { EcpCliError } from "../src/errors.js"
import { ECP_INPUT_INVALID, EXIT_USAGE } from "../src/codes.js"
import { failureEnvelope } from "../src/envelope.js"
import { clearHost, setHost } from "../src/host.js"

describe("toCommands", () => {
  it("generates one command per capability with jsonata-style id", () => {
    const ext = defineExtension("@executioncontrolprotocol", "jsonata")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/jsonata", "transform")
          .withInput(z.object({ expression: z.string(), payload: z.unknown() }))
          .withOutput(z.object({ result: z.unknown() }))
          .withMetadata({
            summary: "Evaluate a JSONata expression",
            description: "Runs locally.",
            useCases: ["Project bulky JSON"],
            projections: [{ summary: "Take result", description: "The evaluated JSON." }],
          })
          .withHandler(async () => ({ result: 1 })),
      ])
      .build()
    const commands = toCommands(ext)
    expect(Object.keys(commands)).toEqual(["jsonata:transform"])
    const cls = commands["jsonata:transform"]
    expect(cls).toBeDefined()
    expect(cls?.enableJsonFlag).toBe(true)
    expect(cls?.summary).toMatch(/JSONata/i)
    expect(cls?.description).toMatch(/Use cases/)
    expect(cls?.description).toMatch(/Projections/)
    expect(cls?.flags).toHaveProperty("expression")
    expect(cls?.flags).toHaveProperty("input")
    expect(cls?.flags).not.toHaveProperty("payload")
    expect(cls?.aliases ?? []).toEqual([])
  })

  it("adds command aliases from metadata.topicAlias without a second definition", () => {
    const ext = defineExtension("@executioncontrolprotocol", "adobe-firefly-services")
      .withMetadata({
        summary: "Call Adobe Firefly Services APIs",
        description: "Generated Adobe Firefly Services capabilities.",
        topicAlias: "firefly",
      })
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/adobe-firefly-services", "generate-images")
          .withInput(z.object({ prompt: z.string() }))
          .withOutput(z.object({ ok: z.boolean() }))
          .withMetadata({
            summary: "Generate images",
            description: "Calls Firefly image generation.",
            useCases: ["Create a still from a prompt"],
            projections: [{ summary: "Take the job", description: "Use the job id for status." }],
          })
          .withHandler(async () => ({ ok: true })),
      ])
      .build()
    const commands = toCommands(ext)
    expect(Object.keys(commands)).toEqual(["adobe-firefly-services:generate-images"])
    expect(commands["adobe-firefly-services:generate-images"]?.aliases).toEqual([
      "firefly:generate-images",
    ])
  })

  it("returns an empty map for a policy-only definition", () => {
    const pol = definePolicy("@executioncontrolprotocol", "budget")
      .withHooks([hook("policy:pre", () => ({ type: "allow" as const }))])
      .build()
    expect(toCommands(pol)).toEqual({})
  })

  it("maps defineOperation positional cli.args", () => {
    const op = defineOperation("environments:search")
      .withInput(z.object({ query: z.string(), env: z.string().optional() }))
      .withMetadata({
        summary: "Search capabilities",
        cli: { args: ["query"] },
      })
      .withHandler(async () => [])
      .build()
    const commands = toCommands([op])
    expect(Object.keys(commands)).toEqual(["environments:search"])
    const cls = commands["environments:search"]
    expect(cls?.args).toHaveProperty("query")
    expect(cls?.flags).toHaveProperty("env")
    expect(cls?.flags).not.toHaveProperty("query")
    expect(cls?.aliases ?? []).toEqual([])
  })

  it("copies operation metadata aliases onto the generated command", () => {
    const op = defineOperation("workflows:run")
      .withInput(z.object({ "workflow-path": z.string() }))
      .withMetadata({
        summary: "Run a workflow file",
        aliases: ["run"],
        cli: { args: ["workflow-path"] },
      })
      .withHandler(async () => undefined)
      .build()
    const commands = toCommands([op])
    expect(Object.keys(commands)).toEqual(["workflows:run"])
    expect(commands["workflows:run"]?.aliases).toEqual(["run"])
  })

  it("prints ECP_* envelopes from toErrorJson, not oclif's error JSON", () => {
    const err = new EcpCliError(ECP_INPUT_INVALID, "bad", { path: "expression", exitCode: EXIT_USAGE })
    const body = EcpCommand.prototype.toErrorJson.call(
      { jsonEnabled: () => true } as never,
      err
    )
    expect(body).toEqual(
      failureEnvelope({ code: ECP_INPUT_INVALID, message: "bad", path: "expression" })
    )
    expect(JSON.stringify(body)).not.toMatch(/"oclif"/)
  })

  it("returns an empty map when capabilities is not an array", () => {
    expect(toCommands({ id: "x", name: "x", capabilities: undefined } as never)).toEqual({})
  })

  it("omits examples from fields when there are no generated flags", () => {
    const ext = defineExtension("@executioncontrolprotocol", "empty")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/empty", "noop")
          .withInput(z.object({ payload: z.unknown() }))
          .withOutput(z.object({}))
          .withHandler(async () => ({})),
      ])
      .build()
    const cls = toCommands(ext)["empty:noop"]
    expect(cls?.examples?.[0]).toMatch(/--input payload.json/)
  })

  it("generated capability run invokes the host and rejects invalid input", async () => {
    const ext = defineExtension("@executioncontrolprotocol", "ping")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/ping", "echo")
          .withInput(z.object({ expression: z.string(), payload: z.unknown() }))
          .withOutput(z.object({ result: z.unknown() }))
          .withHandler(async (input) => ({ result: (input as { expression: string }).expression })),
      ])
      .build()
    const env = environment(NODE_ENVIRONMENT_ID, "cmd-run").with([extension(ext)])
    const ecp = await env.init()
    setHost({ ecp, registry: ecp.getRegistry(), environmentId: "node", output: "json" })
    try {
      const Cmd = toCommands(ext)["ping:echo"]
      expect(Cmd).toBeDefined()
      const dir = await mkdtemp(join(tmpdir(), "ecp-cap-run-"))
      const inputFile = join(dir, "in.json")
      await writeFile(inputFile, JSON.stringify({ payload: { a: 1 } }), "utf8")

      const ok = Object.create(Cmd!.prototype) as InstanceType<typeof Cmd> & {
        parse: () => Promise<{ flags: Record<string, unknown> }>
        argv: string[]
        config: unknown
        jsonEnabled: () => boolean
        writeSuccess: (data: unknown) => void
      }
      ok.parse = async () => ({ flags: { expression: "$.a", input: inputFile } })
      ok.argv = ["--expression", "$.a", "--input", inputFile]
      ok.config = {}
      ok.jsonEnabled = () => true
      ok.writeSuccess = () => undefined
      await expect(ok.run()).resolves.toEqual({ result: "$.a" })

      const bad = Object.create(Cmd!.prototype) as typeof ok
      bad.parse = async () => ({ flags: { input: undefined } })
      bad.argv = []
      bad.config = {}
      bad.jsonEnabled = () => true
      bad.writeSuccess = () => undefined
      await expect(bad.run()).rejects.toBeInstanceOf(EcpCliError)
    } finally {
      clearHost()
      await ecp.terminate()
    }
  })

  it("generated capability failure attaches the invoke record to EcpCliError.data", async () => {
    class HttpErr extends Error {
      status = 400
      bodyText = '{"error":"bad"}'
      url = "https://example.test/v1/jobs"
      output = { partial: true }

      constructor() {
        super("HTTP 400 for https://example.test/v1/jobs")
        this.name = "HttpErr"
      }
    }
    const ext = defineExtension("@executioncontrolprotocol", "ping")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/ping", "fail")
          .withInput(z.object({ payload: z.unknown().optional() }))
          .withOutput(z.object({ partial: z.boolean() }))
          .withHandler(async () => {
            throw new HttpErr()
          }),
      ])
      .build()
    const env = environment(NODE_ENVIRONMENT_ID, "cmd-fail").with([extension(ext)])
    const ecp = await env.init()
    setHost({
      ecp,
      registry: ecp.getRegistry(),
      environmentId: "node",
      output: "json",
      recordInvoke: async () => "inv-1",
    })
    try {
      const Cmd = toCommands(ext)["ping:fail"]
      expect(Cmd).toBeDefined()
      const fail = Object.create(Cmd!.prototype) as InstanceType<typeof Cmd> & {
        parse: () => Promise<{ flags: Record<string, unknown> }>
        argv: string[]
        config: unknown
        jsonEnabled: () => boolean
        writeSuccess: (data: unknown) => void
      }
      fail.parse = async () => ({ flags: {} })
      fail.argv = []
      fail.config = {}
      fail.jsonEnabled = () => true
      fail.writeSuccess = () => undefined
      await expect(fail.run()).rejects.toMatchObject({
        name: "EcpCliError",
        code: "ECP_STEP_FAILED",
        message: "HTTP 400 for https://example.test/v1/jobs",
        data: {
          runId: "inv-1",
          stepId: "invoke",
          capabilityId: "@executioncontrolprotocol/ping.fail",
          status: "failed",
          output: { partial: true },
          diagnostics: [
            expect.objectContaining({
              code: "ECP_STEP_FAILED",
              details: expect.objectContaining({
                name: "HttpErr",
                status: 400,
                bodyText: '{"error":"bad"}',
                url: "https://example.test/v1/jobs",
              }),
            }),
          ],
        },
      })
    } finally {
      clearHost()
      await ecp.terminate()
    }
  })
})
