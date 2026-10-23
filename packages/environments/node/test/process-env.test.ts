import { afterEach, describe, expect, it } from "vitest"
import { defineExtension, env, extension } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { environment, NODE_ENVIRONMENT_ID } from "../src/index.js"

const KEY = "ECP_PROCESS_ENV_TEST_KEY"

function probeExtension() {
  return defineExtension("@executioncontrolprotocol", "process-env-probe")
    .withConfig({ value: z.string().optional() })
    .withCapabilities([])
    .build()
}

afterEach(() => {
  delete process.env[KEY]
})

describe("Node process-env default binding", () => {
  it("resolves a set process env value with no explicit binding", async () => {
    process.env[KEY] = "set-value"
    const probe = probeExtension()
    const envBuilder = environment(NODE_ENVIRONMENT_ID, "env-set").with([
      extension(probe).with({ value: env(KEY) }),
    ])
    await envBuilder.init()
    const resolved = envBuilder.ecpResolveBindings().extensions.find((e) => e.id === probe.id)
    expect(resolved?.config.value).toBe("set-value")
  })

  it("throws when a required env key is unset", async () => {
    delete process.env[KEY]
    const probe = probeExtension()
    await expect(
      environment(NODE_ENVIRONMENT_ID, "env-unset").with([
        extension(probe).with({ value: env(KEY) }),
      ]).init()
    ).rejects.toThrow(KEY)
  })

  it("resolves an optional unset key as undefined", async () => {
    delete process.env[KEY]
    const probe = probeExtension()
    const envBuilder = environment(NODE_ENVIRONMENT_ID, "env-optional").with([
      extension(probe).with({ value: env(KEY, { optional: true }) }),
    ])
    await envBuilder.init()
    const resolved = envBuilder.ecpResolveBindings().extensions.find((e) => e.id === probe.id)
    expect(resolved?.config.value).toBeUndefined()
  })
})
