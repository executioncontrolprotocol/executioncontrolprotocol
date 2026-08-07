import { describe, expect, it } from "vitest"
import { workflow, step, applyPatch, buildStepIndex, parallel } from "../../src/index.js"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"

function weeklyBriefManifest(): WorkflowManifest {
  return workflow("Weekly Brief")
    .id("weekly-brief")
    .run([
      step("@executioncontrolprotocol/memory.search", "Collect Signals")
        .id("collect-signals")
        .with({ query: "risks", since: "7d" })
        .as("signals"),
      step("@executioncontrolprotocol/openai.generate", "Write Brief")
        .id("write-brief")
        .with({
          prompt: "Create a brief",
          options: { maxWords: 100, tone: "neutral" },
        })
        .as("brief"),
    ])
    .toManifest()
}

describe("applyPatch", () => {
  it("applies shorthand patch using step id path", async () => {
    const manifest = weeklyBriefManifest()
    const patched = applyPatch(manifest, {
      "steps[write-brief].input": {
        prompt: "Create a concise executive brief.",
      },
    })

    expect(patched.success).toBe(true)
    const index = buildStepIndex(patched.result!)
    const path = index.pathsById.get("write-brief")!
    const stepNode = path.match(/^steps\[(\d+)\]/)?.[1]
    const stepAt = patched.result!.steps[Number(stepNode)] as import("@executioncontrolprotocol/types").StepNode
    expect(stepAt.input?.prompt).toBe("Create a concise executive brief.")
  })

  it("replaces the steps array when path is steps", () => {
    const manifest = workflow("Echo")
      .id("echo-test")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").id("echo").with({ value: "hi" }).as("echo")])
      .toManifest()

    const patched = applyPatch(manifest, [
      {
        path: "steps",
        mode: "replace",
        value: [
          {
            type: "step",
            id: "echo",
            label: "Echo",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "hi" },
            as: "echo",
          },
          {
            type: "step",
            id: "summarize",
            label: "Summarize",
            uses: "@executioncontrolprotocol/test.summarize",
            input: { text: { $ref: "state.echo.output" } },
            as: "summary",
          },
        ],
      },
    ])

    expect(patched.success).toBe(true)
    expect(patched.result!.steps).toHaveLength(2)
    expect(patched.result!.steps[1]?.id).toBe("summarize")
  })

  it("inserts a step via eql:add-step without removing existing steps", () => {
    const manifest = workflow("Echo")
      .id("echo-test")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").id("echo").with({ value: "hi" }).as("echo")])
      .toManifest()

    const patched = applyPatch(manifest, [
      {
        path: "steps",
        mode: "replace",
        reason: "eql:add-step",
        value: {
          step: {
            type: "step",
            id: "summarize",
            label: "Summarize",
            uses: "@executioncontrolprotocol/test.summarize",
            input: { text: { $ref: "state.echo.output" } },
            as: "summary",
          },
          _eqlInsertAfter: "echo",
        },
      },
    ])

    expect(patched.success).toBe(true)
    expect(patched.result!.steps).toHaveLength(2)
    expect(patched.result!.steps[0]?.id).toBe("echo")
    expect(patched.result!.steps[1]?.id).toBe("summarize")
  })

  it("removes a step via eql:delete", () => {
    const manifest = workflow("Echo notify")
      .id("echo-notify")
      .run([
        step("@executioncontrolprotocol/test.echo", "Echo").id("echo").with({ value: "hi" }).as("echo"),
        step("@executioncontrolprotocol/test.notify", "Notify").id("notify").with({ payload: { ok: true } }).as("notify"),
      ])
      .toManifest()

    const patched = applyPatch(manifest, [
      {
        path: "steps[notify]",
        mode: "replace",
        value: null,
        reason: "eql:delete",
      },
    ])

    expect(patched.success).toBe(true)
    expect(patched.result!.steps).toHaveLength(1)
    expect(patched.result!.steps[0]?.id).toBe("echo")
  })

  it("replaces scalar step fields without corrupting the step", () => {
    const manifest = workflow("Echo")
      .id("echo-test")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").id("echo").with({ value: "hi" }).as("echo")])
      .toManifest()

    const patched = applyPatch(manifest, {
      "steps[echo].label": "Patched Echo",
    })

    expect(patched.success).toBe(true)
    const echoStep = patched.result!.steps.find((s) => s.id === "echo")
    expect(echoStep?.label).toBe("Patched Echo")
    expect(echoStep?.uses).toBe("@executioncontrolprotocol/test.echo")
  })

  it("deep merges by default", () => {
    const manifest = weeklyBriefManifest()
    const patched = applyPatch(manifest, {
      "steps[write-brief].input.options": {
        tone: "executive",
      },
    })

    expect(patched.success).toBe(true)
    const index = buildStepIndex(patched.result!)
    const stepNode = patched.result!.steps[
      Number(index.pathsById.get("write-brief")!.match(/^steps\[(\d+)\]/)?.[1])
    ] as import("@executioncontrolprotocol/types").StepNode
    expect(stepNode.input?.options).toMatchObject({ tone: "executive", maxWords: 100 })
  })

  it("replaces when mode is replace", () => {
    const manifest = weeklyBriefManifest()
    const patched = applyPatch(manifest, [
      {
        path: "steps[write-brief].input",
        mode: "replace",
        value: { prompt: "Only this remains." },
      },
    ])

    expect(patched.success).toBe(true)
    const index = buildStepIndex(patched.result!)
    const stepNode = patched.result!.steps[
      Number(index.pathsById.get("write-brief")!.match(/^steps\[(\d+)\]/)?.[1])
    ] as import("@executioncontrolprotocol/types").StepNode
    expect(stepNode.input).toEqual({ prompt: "Only this remains." })
  })

  it("fails when duplicate step ids exist", () => {
    const duplicate: WorkflowManifest = {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "dup" },
      steps: [
        { type: "step", id: "write-brief", uses: "@executioncontrolprotocol/test.echo", input: {} },
        { type: "step", id: "write-brief", uses: "@executioncontrolprotocol/test.echo", input: {} },
      ],
    }

    const patched = applyPatch(duplicate, {
      "steps[write-brief].input": { prompt: "x" },
    })

    expect(patched.success).toBe(false)
    expect(patched.diagnostics.some((d) => d.code === "DUPLICATE_STEP_ID")).toBe(true)
  })

  it("returns PATCH_PATH_NOT_FOUND for unknown step id", () => {
    const manifest = weeklyBriefManifest()
    const patched = applyPatch(manifest, {
      "steps[unknown-step].input": { prompt: "x" },
    })
    expect(patched.success).toBe(false)
    expect(patched.diagnostics.some((d) => d.code === "PATCH_PATH_NOT_FOUND")).toBe(true)
  })

  it("resolves nested parallel step paths", () => {
    const manifest = workflow("Nested")
      .run([
        parallel([
          [step("@executioncontrolprotocol/test.echo", "Inner").with({ value: "a" }).as("inner")],
        ]),
      ])
      .toManifest()
    const parallelNode = manifest.steps[0] as import("@executioncontrolprotocol/types").ParallelNode
    const innerStep = parallelNode.branches[0]![0] as import("@executioncontrolprotocol/types").StepNode
    const index = buildStepIndex(manifest)
    const innerPath = index.pathsById.get(innerStep.id)
    expect(innerPath).toMatch(/^steps\[0\]\.branches\[/)
    const patched = applyPatch(manifest, {
      [`steps[${innerStep.id}].input`]: { value: "patched" },
    })
    expect(patched.success).toBe(true)
  })
})

describe("assignUniqueStepIds via toManifest", () => {
  it("assigns unique ids for duplicate labels", () => {
    const manifest = workflow("Dup labels")
      .run([
        step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "a" }).as("o"),
        step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "b" }).as("o2"),
      ])
      .toManifest()

    const ids = manifest.steps.map((s) => (s as import("@executioncontrolprotocol/types").StepNode).id)
    expect(new Set(ids).size).toBe(2)
  })
})
