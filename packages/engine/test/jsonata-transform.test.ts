import { describe, expect, it } from "vitest"
import type { CapabilityEntry, ExecutionManifest, HandlerContext } from "@executioncontrolprotocol/protocol"
import { EXECUTION_SCHEMA, EXECUTION_VERSION } from "@executioncontrolprotocol/protocol"
import transformHandler from "../../../plugins/plugin-jsonata/src/capabilities/transform.js"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { HostSchemaSet, runExecution, validateExecution } from "../src/index.js"

const jsonataCapability: CapabilityEntry = {
  id: "@executioncontrolprotocol/jsonata.transform",
  plugin: "@executioncontrolprotocol/jsonata",
  package: "@executioncontrolprotocol/plugin-jsonata",
  pluginVersion: "0.60.0",
  summary: "JSONata transform",
  description: "",
  useCases: [],
  projections: [],
  contract: "step",
  code: "expression",
  timeoutMs: 1000,
}

function jsonataManifest(overrides: Partial<ExecutionManifest["steps"][number]>): ExecutionManifest {
  return {
    schema: EXECUTION_SCHEMA,
    version: EXECUTION_VERSION,
    steps: [
      {
        id: "Pick",
        uses: jsonataCapability.id,
        accepts: {
          type: "object",
          properties: {
            people: {
              type: "array",
              items: {
                type: "object",
                properties: { name: { type: "string" } },
                required: ["name"],
                additionalProperties: false,
              },
            },
          },
          required: ["people"],
          additionalProperties: false,
        },
        returns: {
          type: "object",
          properties: {
            names: { type: "array", items: { type: "string" } },
          },
          required: ["names"],
          additionalProperties: false,
        },
        expression: '{ "names": people.name }',
        input: {
          people: [{ name: "Ada" }, { name: "Grace" }],
        },
        as: "picked",
        ...overrides,
      },
    ],
  }
}

function handlerContextFromInit(
  init: { runId: string; stepId: string; state: Record<string, unknown>; expression?: string },
  signal: AbortSignal,
): HandlerContext {
  return {
    config: undefined,
    signal,
    run: { id: init.runId },
    step: { id: init.stepId },
    state: Object.freeze({ ...init.state }),
    store: { set() {}, merge() {}, append() {} },
    files: {
      async read() {
        return { bytes: new Uint8Array(), mediaType: "application/octet-stream" }
      },
      async writeArtifact() {
        return { kind: "artifact", uri: "ecp://runs/run-1/artifacts/out", mediaType: "application/octet-stream" }
      },
    },
    async call() {
      return undefined
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    usage: { record() {} },
    expression: init.expression,
  }
}

describe("jsonata transform validation", () => {
  it("suggests ecp plugins install jsonata when the plugin is missing", async () => {
    const manifest = jsonataManifest({})
    const result = await validateExecution(manifest, { capabilities: [] })
    // Only the missing plugin: without the capability, accepts/returns/expression can't be judged.
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "ECP_PLUGINS_MISSING",
        message: expect.stringMatching(/ecp plugins install jsonata/),
      }),
    ])
  })
})

describe("jsonata transform execution", () => {
  const engine = new QuickJsExpressionEngine()

  async function runWithHandler(manifest: ExecutionManifest) {
    const schemas = await HostSchemaSet.create([jsonataCapability])
    return runExecution(manifest, {}, {
      capabilities: [jsonataCapability],
      expression: engine,
      schemas,
      call: async (request, signal) => {
        const context = request.context as {
          runId: string
          stepId: string
          state: Record<string, unknown>
          expression?: string
        }
        return transformHandler(
          request.input,
          handlerContextFromInit(
            {
              runId: context.runId,
              stepId: context.stepId,
              state: context.state,
              expression: context.expression,
            },
            signal,
          ),
        )
      },
    })
  }

  it("returns projected names", async () => {
    const outcome = await runWithHandler(jsonataManifest({}))
    expect(outcome.status).toBe("completed")
    expect(outcome.state.picked).toEqual({ names: ["Ada", "Grace"] })
  })

  it("fails with ECP_OUTPUT_INVALID when JSONata returns the wrong shape", async () => {
    const manifest = jsonataManifest({ expression: "42" })
    const outcome = await runWithHandler(manifest)
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.code).toBe("ECP_OUTPUT_INVALID")
  })

  it("surfaces JSONata syntax errors on the run", async () => {
    const manifest = jsonataManifest({ expression: "{" })
    const outcome = await runWithHandler(manifest)
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.code).toBe("ECP_STEP_FAILED")
    expect(outcome.error?.message).toMatch(/position/i)
  })

  it("stops a runaway expression at capability timeoutMs with ECP_STEP_TIMEOUT", async () => {
    const manifest = jsonataManifest({
      expression: "( $loop := function($n) { $loop($n + 1) }; $loop(0) )",
      returns: { type: "number" },
    })
    const started = Date.now()
    const schemas = await HostSchemaSet.create([jsonataCapability])
    const outcome = await runExecution(manifest, {}, {
      capabilities: [jsonataCapability],
      expression: engine,
      schemas,
      call: async (request, signal) => {
        const context = request.context as {
          runId: string
          stepId: string
          state: Record<string, unknown>
          expression?: string
        }
        return transformHandler(
          request.input,
          handlerContextFromInit(
            {
              runId: context.runId,
              stepId: context.stepId,
              state: context.state,
              expression: context.expression,
            },
            signal,
          ),
        )
      },
    })
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.code).toBe("ECP_STEP_TIMEOUT")
    expect(Date.now() - started).toBeLessThan(5000)
  })
})