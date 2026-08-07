import { describe, expect, it, beforeAll } from "vitest"
import { z } from "zod"
import {
  ECP_HARNESS_ERROR_CODES,
  ECP_INVOKE_ERROR_CODES,
  ECP_MODEL_GENERATE_INTERFACE,
  harnessCapabilityId,
} from "@executioncontrolprotocol/types"
import { extension } from "../../src/bindings/extension.js"
import { harness } from "../../src/bindings/harness.js"
import { environment } from "../../src/environment/environment.js"
import { runtime } from "../../src/bindings/runtime.js"
import { defineHarness } from "../../src/harness/define-harness.js"
import { catalogHarness } from "../../src/harness/harness-catalog.js"
import { executeHarnessInvoke } from "../../src/harness/execute-harness.js"
import {
  registerTestMinimalHarness,
  TEST_MINIMAL_HARNESS_ID,
} from "../../src/harness/definitions/test-minimal-harness.js"
import { registerCoreFormats } from "../../src/formats/register-core-formats.js"
import { registerNodeRuntime, NODE_RUNTIME_ID } from "@executioncontrolprotocol/node"
import { registerTestExtension } from "../../src/testing/test-extension.js"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"

const THROWING_HARNESS_ID = "@executioncontrolprotocol/harness-throw-test" as const
const BAD_OUTPUT_HARNESS_ID = "@executioncontrolprotocol/harness-bad-output-test" as const

describe("executeHarnessInvoke", () => {
  beforeAll(async () => {
    await registerCoreFormats()
    registerTestMinimalHarness()
    catalogHarness(
      defineHarness("@executioncontrolprotocol", "harness-throw-test")
        .withInput(z.object({ request: z.string() }))
        .withOutput(
          z.object({
            artifact: z.unknown(),
            raw: z.string(),
            trace: z.record(z.unknown()),
          })
        )
        .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
        .withHandler(async () => {
          throw new Error("handler failed intentionally")
        })
        .build()
    )
    catalogHarness(
      defineHarness("@executioncontrolprotocol", "harness-bad-output-test")
        .withInput(z.object({ request: z.string() }))
        .withOutput(
          z.object({
            artifact: z.string(),
            raw: z.string(),
            trace: z.record(z.unknown()),
          })
        )
        .usesProviderInterface(ECP_MODEL_GENERATE_INTERFACE)
        .withHandler(async () => ({
          artifact: 123,
          raw: "bad",
          trace: {},
        }))
        .build()
    )
    await registerNodeRuntime()
    await registerTestExtension()
    await registerFormatToonExtension()
  })

  async function demoHarnessEnv(withHarness = true) {
    let builder = environment("execute-harness-test")
      .withRuntime(runtime(NODE_RUNTIME_ID))
      .withExtensions([
        extension("@executioncontrolprotocol/format-toon").with({}),
        extension("@executioncontrolprotocol/test").with({}),
      ])
    if (withHarness) {
      builder = builder.withHarnesses([
        harness(TEST_MINIMAL_HARNESS_ID).uses("@executioncontrolprotocol/test.generate").with({}),
        harness(THROWING_HARNESS_ID).uses("@executioncontrolprotocol/test.generate").with({}),
        harness(BAD_OUTPUT_HARNESS_ID).uses("@executioncontrolprotocol/test.generate").with({}),
      ])
    }
    const ecp = await builder.init()
    return { env: builder, ecp }
  }

  it("rejects non-harness capability ids", async () => {
    const { env, ecp } = await demoHarnessEnv()
    const result = await executeHarnessInvoke(
      env,
      "@executioncontrolprotocol/test.generate" as "@executioncontrolprotocol/test-minimal-harness.evaluate",
      { value: "x" }
    )
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe(ECP_INVOKE_ERROR_CODES.CAPABILITY_NOT_FOUND)
    await ecp.terminate()
  })

  it("reports unbound harness", async () => {
    const { env, ecp } = await demoHarnessEnv(false)
    const result = await executeHarnessInvoke(env, harnessCapabilityId(TEST_MINIMAL_HARNESS_ID), {
      value: "x",
    })
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe(ECP_HARNESS_ERROR_CODES.HARNESS_NOT_BOUND)
    await ecp.terminate()
  })

  it("reports invalid harness input", async () => {
    const { env, ecp } = await demoHarnessEnv()
    const result = await executeHarnessInvoke(env, harnessCapabilityId(TEST_MINIMAL_HARNESS_ID), {
      value: 123,
    })
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe(ECP_INVOKE_ERROR_CODES.INVOKE_INPUT_INVALID)
    await ecp.terminate()
  })

  it("reports handler failures", async () => {
    const { env, ecp } = await demoHarnessEnv()
    const result = await executeHarnessInvoke(env, harnessCapabilityId(THROWING_HARNESS_ID), {
      request: "fail",
    })
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe(ECP_HARNESS_ERROR_CODES.HARNESS_EVALUATE_FAILED)
    expect(result.diagnostics[0]?.message).toContain("handler failed intentionally")
    await ecp.terminate()
  })

  it("reports invalid harness output", async () => {
    const { env, ecp } = await demoHarnessEnv()
    const result = await executeHarnessInvoke(env, harnessCapabilityId(BAD_OUTPUT_HARNESS_ID), {
      request: "bad output",
    })
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe(ECP_INVOKE_ERROR_CODES.INVOKE_OUTPUT_INVALID)
    await ecp.terminate()
  })

  it("reports unknown catalog harness", async () => {
    const { env, ecp } = await demoHarnessEnv()
    const result = await executeHarnessInvoke(
      env,
      harnessCapabilityId("@executioncontrolprotocol/not-registered"),
      { value: "x" }
    )
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe(ECP_HARNESS_ERROR_CODES.UNKNOWN_HARNESS)
    await ecp.terminate()
  })
})
