import { describe, expect, it, beforeAll } from "vitest"
import { z } from "zod"
import { harnessCapabilityId } from "@executioncontrolprotocol/types"
import { workflow, step } from "../../src/index.js"
import {
  parseWorkflowManifest,
  workflowManifestSchema,
} from "../../src/validate/workflow-schema.js"
import { validateWorkflow } from "../../src/validate/workflow.js"
import { catalogHarness, resetHarnessCatalogForTests } from "../../src/harness/harness-catalog.js"
import { defineHarness } from "../../src/harness/define-harness.js"

const VALIDATE_TEST_HARNESS_ID = "@executioncontrolprotocol/harness-validate-step-test" as const
const VALIDATE_TEST_HARNESS_CAPABILITY = harnessCapabilityId(VALIDATE_TEST_HARNESS_ID)

describe("workflowManifestSchema", () => {
  beforeAll(() => {
    resetHarnessCatalogForTests()
    catalogHarness(
      defineHarness("@executioncontrolprotocol", "harness-validate-step-test")
        .withInput(z.object({ task: z.string() }))
        .withOutput(z.object({ artifact: z.unknown(), raw: z.string(), trace: z.record(z.unknown()) }))
        .withHandler(async () => ({ artifact: {}, raw: "", trace: {} }))
        .build()
    )
  })

  it("accepts a valid builder manifest", () => {
    const manifest = workflow("Echo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("echo")])
      .toManifest()
    expect(() => parseWorkflowManifest(manifest)).not.toThrow()
    expect(validateWorkflow(manifest).valid).toBe(true)
  })

  it("rejects step with capabilityId instead of uses", () => {
    const invalid = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "bad" },
      steps: [{ id: "echo", capabilityId: "@executioncontrolprotocol/test.echo", label: "Demo Echo", as: "echo" }],
    }
    const parsed = workflowManifestSchema.safeParse(invalid)
    expect(parsed.success).toBe(false)
    expect(validateWorkflow(invalid as never).valid).toBe(false)
  })

  it("rejects step missing uses", () => {
    const invalid = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "bad" },
      steps: [{ id: "echo", label: "Demo Echo", as: "echo" }],
    }
    expect(workflowManifestSchema.safeParse(invalid).success).toBe(false)
  })

  it("rejects invalid capability id format", () => {
    const invalid = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "bad" },
      steps: [{ id: "echo", uses: "not-a-capability", as: "echo" }],
    }
    expect(workflowManifestSchema.safeParse(invalid).success).toBe(false)
  })

  it("rejects manifest missing steps array", () => {
    const invalid = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "bad" },
    }
    expect(workflowManifestSchema.safeParse(invalid).success).toBe(false)
  })

  it("rejects harness evaluate capability as a workflow step", () => {
    const manifest = workflow("Bad harness step")
      .run([
        step(VALIDATE_TEST_HARNESS_CAPABILITY as "@executioncontrolprotocol/test.echo", "Harness")
          .with({ task: "chat" })
          .as("bad"),
      ])
      .toManifest()
    const descriptor: import("@executioncontrolprotocol/types").EnvironmentDescriptor = {
      schema: "@executioncontrolprotocol.environment.describe",
      version: "1.0.0",
      environment: { id: "test" },
      runtime: { id: "local", features: {} },
      extensions: [],
      capabilities: [
        {
          id: VALIDATE_TEST_HARNESS_CAPABILITY,
          extension: VALIDATE_TEST_HARNESS_ID,
        },
      ],
      policies: [],
    }
    const result = validateWorkflow(manifest, descriptor)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === "HARNESS_CAPABILITY_NOT_A_STEP")).toBe(true)
  })
})
