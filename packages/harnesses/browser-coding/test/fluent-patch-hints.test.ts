import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import {
  buildFluentPatchHintLines,
  collectFluentCompileErrorFeedback,
  collectFluentPatchGoalFeedback,
} from "../src/fluent-patch-hints.js"

const fixturesRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../fixtures/workflows"
)

function loadWorkflow(name: string): WorkflowManifest {
  const raw = readFileSync(path.join(fixturesRoot, name), "utf8")
  return JSON.parse(raw) as WorkflowManifest
}

describe("buildFluentPatchHintLines", () => {
  it("wf-patch-01 mentions echo step id and Fluent label edit", () => {
    const wf = loadWorkflow("echo-workflow.json")
    const lines = buildFluentPatchHintLines(
      "Change the echo step label to Patched Echo.",
      wf
    )
    const text = lines.join("\n")
    expect(text).toContain('Target step id "echo"')
    expect(text).toContain('Preserve every existing step .id')
  })

  it("wf-patch-03 steers append step and ref after echo", () => {
    const wf = loadWorkflow("echo-workflow.json")
    const caps = ["@executioncontrolprotocol/test.echo", "@executioncontrolprotocol/test.summarize"]
    const lines = buildFluentPatchHintLines(
      "Add a summarize step after echo using @executioncontrolprotocol/test.summarize.",
      wf,
      caps
    )
    const text = lines.join("\n")
    expect(text).toMatch(/ref\(|append/i)
    expect(text).toContain("@executioncontrolprotocol/test.summarize")
  })

  it("wf-patch-12 steers reorder in run array not moveStep", () => {
    const wf = loadWorkflow("echo-validate-reorder.json")
    const lines = buildFluentPatchHintLines(
      "Move the echo step to run after validate.",
      wf
    )
    const text = lines.join("\n")
    expect(text).toContain("Reorder .run([...])")
    expect(text).toContain("validate, echo")
  })
})

describe("collectFluentCompileErrorFeedback", () => {
  it("maps Failed to resolve module specifier to a core-import-only repair hint", () => {
    const feedback = collectFluentCompileErrorFeedback(
      'Failed to resolve module specifier "@executioncontrolprotocol/core". Relative references must start with either "/", "./", or "../".'
    )
    expect(feedback?.length).toBe(1)
    const text = feedback![0]!.issues.map((i) => i.message).join(" ")
    expect(text).toContain("@executioncontrolprotocol/core")
    expect(text).toMatch(/Do not import other packages/i)
  })

  it("maps missing workflow shim errors", () => {
    const feedback = collectFluentCompileErrorFeedback(
      "Cannot destructure property 'workflow' of 'globalThis.__ecpWorkflowShim' as it is undefined."
    )
    expect(feedback?.some((f) => f.issues.some((i) => i.message.includes("named import")))).toBe(
      true
    )
  })
})

describe("collectFluentPatchGoalFeedback", () => {
  it("flags missing echo step id after label patch", () => {
    const baseline = loadWorkflow("echo-workflow.json")
    const patched: WorkflowManifest = {
      ...baseline,
      steps: [
        {
          type: "step",
          id: "patched-echo",
          label: "Patched Echo",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: "hello from fluent API" },
          as: "echo",
        },
      ],
    }
    const feedback = collectFluentPatchGoalFeedback(
      "Change the echo step label to Patched Echo.",
      patched,
      { capabilities: [], extensions: [] } as import("@executioncontrolprotocol/core").CompactEnvironmentSummary,
      baseline
    )
    expect(feedback?.length).toBeGreaterThan(0)
    expect(
      feedback!.some((f) => f.issues.some((i) => i.message.includes("echo")))
    ).toBe(true)
  })
})
