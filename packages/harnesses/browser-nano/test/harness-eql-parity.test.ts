import { describe, expect, it, beforeAll } from "vitest"
import {
  catalogExtension,
  capabilityFor,
  defineExtension,
  environment,
  extension,
  harness,
  registerCoreFormats,
} from "@executioncontrolprotocol/core"
import { registerTestExtension } from "../../../core/src/testing/test-extension.js"
import {
  BROWSER_NANO_HARNESS_CAPABILITY,
  HARNESS_NANO_BINDING,
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

const eqlAssistantExtension = defineExtension("@executioncontrolprotocol", "eql-assistant-gen")
  .withConfig({})
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/eql-assistant-gen", "generate")
      .withInput(modelGenerateInputSchema)
      .withOutput(modelGenerateOutputSchema)
      .withHandler(async () => ({
        text: 'REPLY\n  ANSWER "I build and patch ECP workflows, answer ECP questions, and explain capabilities registered in this environment."',
      })),
  ])
  .build()

describe("browser nano harness EQL parity", () => {
  beforeAll(async () => {
    await registerCoreFormats()
    await registerFormatEqlExtension()
    await registerNodeRuntime()
    await registerTestExtension()
    catalogExtension(eqlAssistantExtension)
    resetBrowserNanoHarnessRegistrationForTests()
    registerBrowserNanoHarnesses()
  })

  it("decodes EQL assistant output with the nano binding", async () => {
    const env = environment("workflow-assistant-eql-parity-test")
      .withRuntime(runtime(NODE_RUNTIME_ID))
      .withExtensions([
        extension("@executioncontrolprotocol/format-eql").with({}),
        extension("@executioncontrolprotocol/test").with({}),
        extension("@executioncontrolprotocol/eql-assistant-gen").with({}),
      ])
      .withHarnesses([
        harness("@executioncontrolprotocol/harness-browser-nano")
          .uses("@executioncontrolprotocol/eql-assistant-gen.generate")
          .with({ ...HARNESS_NANO_BINDING }),
      ])

    const ecp = await env.init()
    try {
      const result = await ecp
        .invoke(BROWSER_NANO_HARNESS_CAPABILITY)
        .with({
          task: "workflow-assistant",
          message: "What can you do?",
        })
        .process()

      expect(result.success).toBe(true)
      const output = result.result as { artifact: { schema: string; answer: string } }
      expect(output.artifact.schema).toBe(ECP_HARNESS_REPLY_SCHEMA)
      expect(output.artifact.answer).toContain("workflows")
    } finally {
      await ecp.terminate()
    }
  })
})
