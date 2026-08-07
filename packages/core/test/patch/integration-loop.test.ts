import { describe, expect, it } from "vitest"
import {
  environment,
  extension,
  runtime,
  normalizeWorkflowManifest,
  registerTestExtension,
} from "../../src/index.js"
import { compileWorkflowSource } from "../../src/compile/index.js"
import { NODE_RUNTIME_ID, registerNodeRuntime } from "@executioncontrolprotocol/node"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"

const fluentSource = `
import { workflow, step } from "@executioncontrolprotocol/core";

export default workflow("Weekly Brief")
  .id("weekly-brief")
  .run([
    step("@executioncontrolprotocol/test.echo", "Write Brief")
      .with({ value: "Create a brief", options: { maxWords: 100 } })
      .as("brief"),
  ]);
`

describe("patch compaction loop", () => {
  it("Fluent → JSON → TOON → patch decode → ecp.patch → compact TOON → Fluent", async () => {
    await registerNodeRuntime()
    await registerTestExtension()
    await registerFormatToonExtension()

    const env = environment("test")
      .withRuntime(runtime(NODE_RUNTIME_ID))
      .withExtensions([
        extension("@executioncontrolprotocol/test").with({}),
        extension("@executioncontrolprotocol/format-toon").with({}),
      ])
    const ecp = await env.init()

    const compiledA = await compileWorkflowSource({
      source: fluentSource,
      filename: "workflow.ts",
    })
    expect(compiledA.ok).toBe(true)
    const manifestA = compiledA.manifest!

    const toon = await ecp
      .encode(manifestA)
      .uses("@executioncontrolprotocol/format-toon")
      .to("@executioncontrolprotocol.workflow")
      .with({ headers: false, compact: true })
      .process()
    expect(toon.success).toBe(true)

    const decodedWorkflow = await ecp
      .decode(toon.result)
      .uses("@executioncontrolprotocol/format-toon")
      .to("@executioncontrolprotocol.workflow")
      .with({ headers: false, compact: true })
      .process()
    expect(decodedWorkflow.success).toBe(true)

    const writeBriefId = (
      (decodedWorkflow.result as WorkflowManifest).steps[0] as import("@executioncontrolprotocol/types").StepNode
    ).id

    const patched = await ecp
      .patch(decodedWorkflow.result as WorkflowManifest)
      .with({
        [`steps[${writeBriefId}].input`]: {
          value: "Create a concise executive brief.",
        },
      })
      .process()
    expect(patched.success).toBe(true)
    expect(patched.result).toBeDefined()

    const compactToon = await ecp
      .encode(patched.result!)
      .uses("@executioncontrolprotocol/format-toon")
      .to("@executioncontrolprotocol.workflow")
      .with({ headers: false, compact: true })
      .process()
    expect(compactToon.success).toBe(true)

    const decoded = await ecp
      .decode(compactToon.result)
      .uses("@executioncontrolprotocol/format-toon")
      .to("@executioncontrolprotocol.workflow")
      .with({ headers: false, compact: true })
      .process()
    expect(decoded.success).toBe(true)

    const fluent = await ecp
      .encode(decoded.result as WorkflowManifest)
      .uses("@executioncontrolprotocol/format-fluent")
      .process()
    expect(fluent.success).toBe(true)

    const compiledB = await compileWorkflowSource({
      source: String(fluent.result),
      filename: "workflow.generated.ts",
    })
    expect(compiledB.ok).toBe(true)
    expect(normalizeWorkflowManifest(compiledB.manifest!)).toEqual(
      normalizeWorkflowManifest(patched.result!)
    )

    await ecp.terminate()
  })
})
