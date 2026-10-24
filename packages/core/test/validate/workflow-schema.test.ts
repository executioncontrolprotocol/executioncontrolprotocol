import { describe, expect, it } from "vitest"
import { workflow, step } from "../../src/index.js"
import {
  parseWorkflowManifest,
  workflowManifestSchema,
} from "../../src/validate/workflow-schema.js"
import { validateWorkflow } from "../../src/validate/workflow.js"

describe("workflowManifestSchema", () => {
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
})
