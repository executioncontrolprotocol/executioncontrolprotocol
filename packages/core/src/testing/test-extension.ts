import { defineExtension } from "../definitions/extension.js"
import { capabilityFor } from "../definitions/capability.js"
import { catalogExtension } from "../registry/extension-catalog.js"
import { globalRegistry } from "../registry/registry.js"
import { modelGenerateInputSchema, modelGenerateOutputSchema } from "@executioncontrolprotocol/types"
import { testModelGenerateHandler } from "./test-model-generate.js"
import { z } from "zod"

const TestStubInput = z.object({ payload: z.unknown().optional() })
const TestStubOutput = z.object({ ok: z.boolean(), result: z.unknown().optional() })

function testStubHandler(input: { payload?: unknown }) {
  return { ok: true, result: input.payload ?? "test-stub" }
}

/** In-repo stub extension for examples and tests. @category Testing */
export const testExtension = defineExtension("@executioncontrolprotocol", "test")
  .withConfig({})
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/test", "echo")
      .withInput(z.object({ value: z.unknown().optional() }))
      .withOutput(z.object({ echo: z.unknown() }))
      .withHandler(async (input) => ({
        echo: (input as { value?: unknown }).value ?? "hi",
      })),
    capabilityFor("@executioncontrolprotocol/test", "generate")
      .withInput(modelGenerateInputSchema)
      .withOutput(modelGenerateOutputSchema)
      .withHandler(async (input) =>
        testModelGenerateHandler(input as { prompt?: string; system?: string })
      ),
    capabilityFor("@executioncontrolprotocol/test", "summarize")
      .withInput(TestStubInput)
      .withOutput(TestStubOutput)
      .withHandler(async (input) => testStubHandler(input as { payload?: unknown })),
    capabilityFor("@executioncontrolprotocol/test", "translate")
      .withInput(TestStubInput)
      .withOutput(TestStubOutput)
      .withHandler(async (input) => testStubHandler(input as { payload?: unknown })),
    capabilityFor("@executioncontrolprotocol/test", "notify")
      .withInput(TestStubInput)
      .withOutput(TestStubOutput)
      .withHandler(async (input) => testStubHandler(input as { payload?: unknown })),
    capabilityFor("@executioncontrolprotocol/test", "validate")
      .withInput(TestStubInput)
      .withOutput(TestStubOutput)
      .withHandler(async (input) => testStubHandler(input as { payload?: unknown })),
  ])
  .build()

catalogExtension(testExtension)

/** Register @executioncontrolprotocol/test capabilities for examples and tests. */
export async function registerTestExtension(
  registry = globalRegistry
): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/test")) {
    await registry.registerExtension(testExtension)
  }
}
