import { describe, expect, it } from "vitest"
import {
  workflow,
  step,
  extension,
  env,
  secrets,
  testExtension,
  PROCESS_ENV_RESOLVER_ID,
  SECRETS_RESOLVER_ID,
  resolveEnvConfigAsync,
} from "@executioncontrolprotocol/core"
import {
  environment,
  setMemorySecret,
  memorySecretsStore,
  resetSecretsStore,
  setSecretsStore,
  NODE_ENVIRONMENT_ID,
} from "../src/index.js"
import { registerEnvironmentConformanceTests } from "../../../core/test/runtime-conformance.js"
import { createTestEnvironment } from "../../../core/test/helpers.js"

registerEnvironmentConformanceTests("@executioncontrolprotocol/node", () =>
  createTestEnvironment("node-conformance")
)

describe("@executioncontrolprotocol/node environment", () => {
  it("runs echo workflow", async () => {
    const envBuilder = environment(NODE_ENVIRONMENT_ID, "node-test").with([
      extension(testExtension),
    ])
    const manifest = workflow("Echo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("echo")])
      .toManifest()
    const ecp = await envBuilder.init()
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("completed")
    expect(result.state.echo).toEqual({ echo: "hi" })
  })
})

describe("@executioncontrolprotocol/process-env and secrets", () => {
  it("process env resolver reads process.env", async () => {
    process.env.ECP_TEST_KEY = "from-process"
    const config = await resolveEnvConfigAsync(
      { v: env("ECP_TEST_KEY") },
      [
        {
          id: PROCESS_ENV_RESOLVER_ID,
          resolve(name) {
            return process.env[name]
          },
        },
      ]
    )
    expect(config.v).toBe("from-process")
    delete process.env.ECP_TEST_KEY
  })

  it("secrets resolver reads from secrets store", async () => {
    setSecretsStore(memorySecretsStore)
    setMemorySecret("SHARED_KEY", "from-secrets")
    process.env.SHARED_KEY = "from-process"
    const config = await resolveEnvConfigAsync(
      { secret: secrets("SHARED_KEY"), envVar: env("SHARED_KEY") },
      [
        {
          id: SECRETS_RESOLVER_ID,
          async resolve(name) {
            return memorySecretsStore.get(name)
          },
        },
        {
          id: PROCESS_ENV_RESOLVER_ID,
          resolve(name) {
            return process.env[name]
          },
        },
      ]
    )
    expect(config.secret).toBe("from-secrets")
    expect(config.envVar).toBe("from-process")
    delete process.env.SHARED_KEY
    resetSecretsStore()
  })
})
