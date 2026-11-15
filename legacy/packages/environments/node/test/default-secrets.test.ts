import { afterEach, describe, expect, it } from "vitest"
import { defineExtension, extension, secrets } from "@executioncontrolprotocol/core"
import { z } from "zod"
import {
  environment,
  NODE_ENVIRONMENT_ID,
  setMemorySecret,
  setSecretsStore,
  memorySecretsStore,
  resetSecretsStore,
} from "../src/index.js"

function probeExtension() {
  return defineExtension("@executioncontrolprotocol", "secrets-probe")
    .withConfig({ value: z.string() })
    .withCapabilities([])
    .build()
}

afterEach(() => {
  resetSecretsStore()
})

describe("Node secrets default binding", () => {
  it("resolves secrets() with no explicit binding", async () => {
    setSecretsStore(memorySecretsStore)
    setMemorySecret("default-secret", "from-node")
    const probe = probeExtension()
    const envBuilder = environment(NODE_ENVIRONMENT_ID, "secrets-default").with([
      extension(probe).with({ value: secrets("default-secret") }),
    ])
    await envBuilder.init()
    const resolved = envBuilder.ecpResolveBindings().extensions.find((e) => e.id === probe.id)
    expect(resolved?.config.value).toBe("from-node")
  })
})
