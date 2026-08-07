import { describe, expect, it, beforeAll } from "vitest"
import {
  catalogExtension,
  capabilityFor,
  defineExtension,
  environment,
  extension,
  harness,
  HARNESS_ASSISTANT_SCOPE_REDIRECT_PHRASE,
  registerCoreFormats,
} from "@executioncontrolprotocol/core"
import { registerTestExtension } from "../../../core/src/testing/test-extension.js"
import {
  BROWSER_NANO_HARNESS_CAPABILITY,
  registerBrowserNanoHarnesses,
  resetBrowserNanoHarnessRegistrationForTests,
} from "@executioncontrolprotocol/harnesses-browser-nano"
import { registerFormatEqlExtension } from "@executioncontrolprotocol/format-eql"
import { registerNodeRuntime, runtime, NODE_RUNTIME_ID } from "@executioncontrolprotocol/node"
import {
  ECP_HARNESS_REPLY_SCHEMA,
  modelGenerateInputSchema,
  modelGenerateOutputSchema,
} from "@executioncontrolprotocol/types"

const invalidGenExtension = defineExtension("@executioncontrolprotocol", "invalid-gen")
  .withConfig({})
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/invalid-gen", "generate")
      .withInput(modelGenerateInputSchema)
      .withOutput(modelGenerateOutputSchema)
      .withHandler(async () => ({ text: "NOT VALID EQL AT ALL" })),
  ])
  .build()

describe("workflow-assistant safe reply fallback", () => {
  beforeAll(async () => {
    await registerCoreFormats()
    await registerFormatEqlExtension()
    await registerNodeRuntime()
    await registerTestExtension()
    catalogExtension(invalidGenExtension)
    resetBrowserNanoHarnessRegistrationForTests()
    registerBrowserNanoHarnesses()
  })

  it("returns safe reply when decode/repair fails", async () => {
    const env = environment("workflow-assistant-safe-reply-test")
      .withRuntime(runtime(NODE_RUNTIME_ID))
      .withExtensions([
        extension("@executioncontrolprotocol/format-eql").with({}),
        extension("@executioncontrolprotocol/test").with({}),
        extension("@executioncontrolprotocol/invalid-gen").with({}),
      ])
      .withHarnesses([
        harness("@executioncontrolprotocol/harness-browser-nano")
          .uses("@executioncontrolprotocol/invalid-gen.generate")
          .with({ repair: { maxAttempts: 0 } }),
      ])

    const ecp = await env.init()
    try {
      const result = await ecp
        .invoke(BROWSER_NANO_HARNESS_CAPABILITY)
        .with({
          task: "workflow-assistant",
          message: "Tell me a joke.",
        })
        .process()

      expect(result.success).toBe(true)
      const output = result.result as { artifact: { schema: string; answer: string } }
      expect(output.artifact.schema).toBe(ECP_HARNESS_REPLY_SCHEMA)
      expect(output.artifact.answer).toContain(HARNESS_ASSISTANT_SCOPE_REDIRECT_PHRASE)
    } finally {
      await ecp.terminate()
    }
  })
})
