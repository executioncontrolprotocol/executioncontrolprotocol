import { defineExtension } from "../definitions/extension.js"
import { capabilityFor } from "../definitions/capability.js"
import type { Registry } from "../registry/registry.js"
import { z } from "zod"

const TestStubInput = z.object({ payload: z.unknown().optional() })
const TestStubOutput = z.object({ ok: z.boolean(), result: z.unknown().optional() })

function testStubHandler(input: { payload?: unknown }) {
  return { ok: true, result: input.payload ?? "test-stub" }
}

/** HTTP error body returned by {@link testExtension} `fail`. @category Testing */
export const TEST_FAIL_BODY = '{"error":"bad"}'

/** Request URL on {@link testExtension} `fail`. @category Testing */
export const TEST_FAIL_URL = "https://example.test/v1/jobs"

/** Error message thrown by {@link testExtension} `fail`. @category Testing */
export const TEST_FAIL_MESSAGE = `HTTP 400 for ${TEST_FAIL_URL}`

/** Partial handler output attached to {@link testExtension} `fail`. @category Testing */
export const TEST_FAIL_OUTPUT = { partial: true }

class TestHttpError extends Error {
  status = 400
  bodyText = TEST_FAIL_BODY
  url = TEST_FAIL_URL
  output = TEST_FAIL_OUTPUT

  constructor() {
    super(TEST_FAIL_MESSAGE)
    this.name = "TestHttpError"
  }
}

/**
 * In-repo stub extension for examples and tests.
 * Production CLI loads the same definition from `@executioncontrolprotocol/plugin-test`;
 * it is not a Node default.
 * @category Testing
 */
export const testExtension = defineExtension("@executioncontrolprotocol", "test")
  .withConfig({})
  .withMetadata({
    summary: "Stub capabilities for examples, CLI demos, and unit tests.",
    description:
      "Provides deterministic echo and placeholder step handlers used by first-party examples and conformance tests without external services."
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/test", "echo")
      .withInput(z.object({ value: z.unknown().optional() }))
      .withOutput(z.object({ echo: z.unknown() }))
      .withExecution("local")
      .withMetadata({
        summary: "Return the input value unchanged.",
        description:
          "Echoes the supplied value or a default greeting. Used to verify wiring, refs, and step output propagation in minimal workflows.",
        useCases: [
          "01-echo example demonstrates a single-step workflow.",
          "Integration test asserts invoke and run paths return payloads."
        ],
        projections: [
          {
            summary: "Use the echoed value",
            description: "Take the echo field as the step output for refs and downstream wiring checks."
          }
        ]
      })
      .withHandler(async (input) => ({
        echo: (input as { value?: unknown }).value ?? "hi"
      })),
    capabilityFor("@executioncontrolprotocol/test", "summarize")
      .withInput(TestStubInput)
      .withOutput(TestStubOutput)
      .withExecution("local")
      .withMetadata({
        summary: "Placeholder summarize step for multi-capability demos.",
        description:
          "Returns a fixed ok stub. Useful in sample workflows that list several capability kinds without real summarization logic.",
        useCases: [
          "Demo manifest shows a summarize step beside echo and translate.",
          "Test verifies multiple capabilities register on one extension."
        ],
        projections: [
          {
            summary: "Use the stub result",
            description: "Take ok and result when present as placeholder output for multi-capability demos."
          }
        ]
      })
      .withHandler(async (input) => testStubHandler(input as { payload?: unknown })),
    capabilityFor("@executioncontrolprotocol/test", "translate")
      .withInput(TestStubInput)
      .withOutput(TestStubOutput)
      .withExecution("local")
      .withMetadata({
        summary: "Placeholder translate step for multi-capability demos.",
        description:
          "Returns a fixed ok stub. Represents a translate-shaped step in examples without calling a real translation service.",
        useCases: [
          "Sample workflow chains translate after summarize.",
          "Registry test lists distinct capability names on test extension."
        ],
        projections: [
          {
            summary: "Use the stub result",
            description: "Take ok and result when present as placeholder output for multi-capability demos."
          }
        ]
      })
      .withHandler(async (input) => testStubHandler(input as { payload?: unknown })),
    capabilityFor("@executioncontrolprotocol/test", "notify")
      .withInput(TestStubInput)
      .withOutput(TestStubOutput)
      .withExecution("local")
      .withMetadata({
        summary: "Placeholder notify step for multi-capability demos.",
        description:
          "Returns a fixed ok stub. Stands in for notification side effects in tutorials and tests.",
        useCases: [
          "Example workflow ends with a notify step after processing.",
          "Unit test covers invoke on a non-echo capability id."
        ],
        projections: [
          {
            summary: "Use the stub result",
            description: "Take ok and result when present as placeholder output for multi-capability demos."
          }
        ]
      })
      .withHandler(async (input) => testStubHandler(input as { payload?: unknown })),
    capabilityFor("@executioncontrolprotocol/test", "validate")
      .withInput(TestStubInput)
      .withOutput(TestStubOutput)
      .withExecution("local")
      .withMetadata({
        summary: "Placeholder validate step for multi-capability demos.",
        description:
          "Returns a fixed ok stub. Represents a validation-shaped step in sample graphs without running real validators.",
        useCases: [
          "Tutorial workflow includes validate before notify.",
          "Conformance test enumerates all test extension capability ids."
        ],
        projections: [
          {
            summary: "Use the stub result",
            description: "Take ok and result when present as placeholder output for multi-capability demos."
          }
        ]
      })
      .withHandler(async (input) => testStubHandler(input as { payload?: unknown })),
    capabilityFor("@executioncontrolprotocol/test", "fail")
      .withInput(z.object({}))
      .withOutput(z.object({ partial: z.boolean() }))
      .withExecution("local")
      .withMetadata({
        summary: "Always fail with an HTTP-shaped error for CLI and journal tests.",
        description:
          "Throws a deterministic error that carries status, bodyText, url, and a partial output object. Used to assert failure records, not as a product capability.",
        useCases: [
          "CLI spawn asserts failed run and invoke print Error Code and details.",
          "Journal test asserts diagnostics.details and redacted output.",
        ],
        projections: [
          {
            summary: "Expect a step failure",
            description:
              "This capability always throws; read diagnostics.details and the attached partial output.",
          },
        ],
      })
      .withHandler(async () => {
        throw new TestHttpError()
      }),
  ])
  .build()

/** Register @executioncontrolprotocol/test capabilities for examples and tests. */
export async function registerTestExtension(registry: Registry): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/test")) {
    await registry.registerExtension(testExtension)
  }
}
