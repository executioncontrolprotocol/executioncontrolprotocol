import { describe, expect, it } from "vitest"
import {
  defineExtension,
  defineEnvironment,
  environment,
  extension,
  capabilityFor,
  InMemoryRuntimeExecutor,
  registerEnvironmentDefinition,
  NODE_ENVIRONMENT_ID,
  BROWSER_ENVIRONMENT_ID,
} from "../src/index.js"
import { ECP_ENVIRONMENT_UNSUPPORTED } from "../src/validate/environment.js"
import { createTestEnvironment } from "./helpers.js"

describe(".supports()", () => {
  createTestEnvironment("supports-boot")

  it("allows any environment when supports is omitted", async () => {
    const ext = defineExtension("@executioncontrolprotocol", "any-env")
      .withCapabilities([])
      .build()
    expect(ext.supportedEnvironments).toBeUndefined()
    const env = environment(NODE_ENVIRONMENT_ID, "any").with([extension(ext)])
    const ecp = await env.init()
    const result = await ecp.validate({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "w" },
      steps: [],
    })
    expect(result.errors.some((e) => e.code === ECP_ENVIRONMENT_UNSUPPORTED)).toBe(false)
    await ecp.terminate()
  })

  it("allows a matching environment", async () => {
    const ext = defineExtension("@executioncontrolprotocol", "node-only-ok")
      .supports(NODE_ENVIRONMENT_ID)
      .withCapabilities([])
      .build()
    const env = environment(NODE_ENVIRONMENT_ID, "ok").with([extension(ext)])
    const ecp = await env.init()
    const result = await ecp.validate({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "w" },
      steps: [],
    })
    expect(result.errors.some((e) => e.code === ECP_ENVIRONMENT_UNSUPPORTED)).toBe(false)
    await ecp.terminate()
  })

  it("allows several environments", () => {
    const ext = defineExtension("@executioncontrolprotocol", "multi")
      .supports(NODE_ENVIRONMENT_ID)
      .supports(BROWSER_ENVIRONMENT_ID)
      .withCapabilities([])
      .build()
    expect(ext.supportedEnvironments?.map((s) => s.id)).toEqual([
      NODE_ENVIRONMENT_ID,
      BROWSER_ENVIRONMENT_ID,
    ])
  })

  it("reports ECP_ENVIRONMENT_UNSUPPORTED with payload when the environment is not listed", async () => {
    registerEnvironmentDefinition(
      defineEnvironment("@executioncontrolprotocol", "browser").withExecutor(
        new InMemoryRuntimeExecutor()
      )
    )
    const ext = defineExtension("@executioncontrolprotocol", "node-gated")
      .supports(NODE_ENVIRONMENT_ID)
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/node-gated", "noop")
          .withExecution("local")
          .withHandler(async () => ({})),
      ])
      .build()
    const env = environment(BROWSER_ENVIRONMENT_ID, "mismatch").with([extension(ext)])
    const ecp = await env.init()
    const result = await ecp.validate({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "w" },
      steps: [],
    })
    const issue = result.errors.find((e) => e.code === ECP_ENVIRONMENT_UNSUPPORTED)
    expect(issue).toBeDefined()
    expect(issue?.message).toContain(ext.id)
    expect(issue?.message).toContain(BROWSER_ENVIRONMENT_ID)
    expect(issue?.message).toContain(NODE_ENVIRONMENT_ID)
    expect(issue?.suggestions).toEqual([NODE_ENVIRONMENT_ID])
    expect(issue?.severity).toBe("error")
    await ecp.terminate()
  })

  it("rejects a version range mismatch", async () => {
    const ext = defineExtension("@executioncontrolprotocol", "range-miss")
      .supports(NODE_ENVIRONMENT_ID, ">=99.0.0")
      .withCapabilities([])
      .build()
    const env = environment(NODE_ENVIRONMENT_ID, "range").with([extension(ext)])
    const ecp = await env.init()
    const result = await ecp.validate({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "w" },
      steps: [],
    })
    const issue = result.errors.find((e) => e.code === ECP_ENVIRONMENT_UNSUPPORTED)
    expect(issue).toBeDefined()
    expect(issue?.message).toContain(">=99.0.0")
    await ecp.terminate()
  })
})
