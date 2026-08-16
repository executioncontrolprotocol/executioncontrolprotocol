import { describe, expect, it, vi } from "vitest"
import {
  workflow,
  step,
  parallel,
  branch,
  loop,
  ref,
  extension,
  registerTestExtension,
} from "@executioncontrolprotocol/core"
import { initEncodingTestEcp } from "../../../core/test/helpers.js"
import {
  extractDataEdges,
  parseStateRef,
  reactFlowRunProgress,
  registerFormatReactflowExtension,
  workflowToReactFlow,
  type ReactFlowDocument,
  type ReactFlowStepData,
} from "../src/index.js"

describe("@executioncontrolprotocol/format-reactflow", () => {
  it("encodes workflow to reactflow JSON with step ports and layout", async () => {
    await registerFormatReactflowExtension()
    await registerTestExtension()
    const ecp = await initEncodingTestEcp([
      extension("@executioncontrolprotocol/format-reactflow").with({}),
      extension("@executioncontrolprotocol/test").with({}),
    ])
    const manifest = workflow("Demo")
      .run([
        step("@executioncontrolprotocol/test.echo", "Echo")
          .with({ value: "x" })
          .as("echo"),
      ])
      .toManifest()
    const encoded = await ecp
      .encode(manifest)
      .uses("@executioncontrolprotocol/format-reactflow")
      .process()
    expect(encoded.success).toBe(true)
    expect(encoded.mediaType).toBe("application/vnd.reactflow+json")
    const doc = JSON.parse(String(encoded.result)) as ReactFlowDocument
    expect(doc.nodes.length).toBeGreaterThan(0)
    const stepNode = doc.nodes.find((n) => n.type === "ecp-step")
    expect(stepNode).toBeDefined()
    const data = stepNode!.data as ReactFlowStepData
    expect(data.label).toBe("Echo")
    expect(data.inputs.some((p) => p.name === "value")).toBe(true)
    expect(data.outputs.length).toBeGreaterThan(0)
    expect(typeof stepNode!.position.x).toBe("number")
    await ecp.terminate()
  })

  it("rejects non-workflow source schemas", async () => {
    await registerFormatReactflowExtension()
    const ecp = await initEncodingTestEcp([
      extension("@executioncontrolprotocol/format-reactflow").with({}),
    ])
    const encoded = await ecp
      .encode({ schema: "@executioncontrolprotocol.environment", version: "1.0" })
      .uses("@executioncontrolprotocol/format-reactflow")
      .to("@executioncontrolprotocol.environment")
      .process()
    expect(encoded.success).toBe(false)
    await ecp.terminate()
  })

  it("extracts data edges from $ref inputs", () => {
    const manifest = workflow("Refs")
      .run([
        step("@executioncontrolprotocol/test.echo", "A").with({ value: "a" }).as("a"),
        step("@executioncontrolprotocol/test.echo", "B")
          .with({ value: ref("a.echo") })
          .as("b"),
      ])
      .toManifest()
    const edges = extractDataEdges(manifest.steps)
    expect(edges.length).toBe(1)
    expect(edges[0]!.data.kind).toBe("data")
    expect(edges[0]!.sourceHandle).toBe("echo")
    expect(edges[0]!.targetHandle).toBe("value")
    const stepA = manifest.steps[0] as { id: string }
    const stepB = manifest.steps[1] as { id: string }
    expect(edges[0]!.source).toBe(stepA.id)
    expect(edges[0]!.target).toBe(stepB.id)
  })

  it("attaches truncated literal binding metadata on input ports", () => {
    const longPrompt =
      "Write a short sample email summarizing the weekly product meeting and action owners for follow-up."
    const doc = workflowToReactFlow({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "lit" },
      steps: [
        {
          id: "s1",
          uses: "@vendor/missing.generate",
          label: "Summarize",
          input: { prompt: longPrompt },
          as: "summary",
        },
      ],
    })
    const data = doc.nodes[0]!.data as ReactFlowStepData
    const prompt = data.inputs.find((p) => p.name === "prompt")
    expect(prompt?.binding).toBe("literal")
    expect(prompt?.valueTitle).toBe(longPrompt)
    expect(prompt?.valuePreview).toBeDefined()
    expect(prompt!.valuePreview!.length).toBeLessThan(longPrompt.length)
    expect(prompt!.valuePreview!.endsWith("…")).toBe(true)
  })

  it("wires summary.text refs to prompt with matching output/input handles", () => {
    const manifest = workflow("Summarize then extract")
      .run([
        step("@vendor/missing.generate", "Summarize Email")
          .id("summarize")
          .with({ prompt: "Summarize this email" })
          .as("summary"),
        step("@vendor/missing.generate", "Extract Action Items")
          .id("extract")
          .with({ prompt: ref("summary.text") })
          .as("actions"),
      ])
      .toManifest()
    const doc = workflowToReactFlow(manifest)
    const dataEdge = doc.edges.find((e) => e.data.kind === "data")
    expect(dataEdge).toBeDefined()
    expect(dataEdge!.sourceHandle).toBe("text")
    expect(dataEdge!.targetHandle).toBe("prompt")
    expect(dataEdge!.source).toBe("summarize")
    expect(dataEdge!.target).toBe("extract")

    const summarize = doc.nodes.find((n) => n.id === "summarize")!.data as ReactFlowStepData
    const extract = doc.nodes.find((n) => n.id === "extract")!.data as ReactFlowStepData
    expect(summarize.outputs.some((p) => p.id === "text")).toBe(true)
    expect(extract.inputs.find((p) => p.name === "prompt")?.binding).toBe("ref")
    expect(extract.inputs.find((p) => p.name === "prompt")?.refPath).toBe("summary.text")
    expect(summarize.inputs.find((p) => p.name === "prompt")?.binding).toBe("literal")
  })

  it("leaves unbound optional schema inputs without binding fields", async () => {
    await registerFormatReactflowExtension()
    await registerTestExtension()
    const ecp = await initEncodingTestEcp([
      extension("@executioncontrolprotocol/format-reactflow").with({}),
      extension("@executioncontrolprotocol/test").with({}),
    ])
    const manifest = workflow("Partial generate")
      .run([
        step("@executioncontrolprotocol/test.generate", "Gen")
          .with({ prompt: "hello" })
          .as("out"),
      ])
      .toManifest()
    const encoded = await ecp
      .encode(manifest)
      .uses("@executioncontrolprotocol/format-reactflow")
      .process()
    const doc = JSON.parse(String(encoded.result)) as ReactFlowDocument
    const data = doc.nodes.find((n) => n.type === "ecp-step")!.data as ReactFlowStepData
    const prompt = data.inputs.find((p) => p.name === "prompt")
    const system = data.inputs.find((p) => p.name === "system")
    expect(prompt?.binding).toBe("literal")
    expect(system).toBeDefined()
    expect(system?.binding).toBeUndefined()
    expect(system?.valuePreview).toBeUndefined()
    expect(system?.refPath).toBeUndefined()
    await ecp.terminate()
  })

  it("parses state refs", () => {
    expect(parseStateRef("state.a.echo")).toEqual({ asKey: "a", fieldPath: "echo" })
    expect(parseStateRef("a")).toEqual({ asKey: "a", fieldPath: "" })
    expect(parseStateRef("")).toBeUndefined()
  })

  it("lays out sequential steps as flat action nodes with control edges", () => {
    const manifest = workflow("Two steps")
      .run([
        step("@executioncontrolprotocol/test.echo", "Generate").with({ value: "a" }).as("email"),
        step("@executioncontrolprotocol/test.echo", "Extract").with({ value: "b" }).as("actions"),
      ])
      .toManifest()
    const doc = workflowToReactFlow(manifest)
    const steps = doc.nodes.filter((n) => n.type === "ecp-step")
    expect(steps).toHaveLength(2)
    expect(doc.nodes.some((n) => n.type === "ecp-group")).toBe(false)
    expect(doc.edges.some((e) => e.data.kind === "control")).toBe(true)
    expect(steps[0]!.position.x).not.toBe(steps[1]!.position.x)
  })

  it("flattens parallel/branch/loop to step nodes without group wrappers", () => {
    const manifest = workflow("Flow")
      .run([
        step("@executioncontrolprotocol/test.echo", "Fetch").with({ value: "x" }).as("fetch"),
        parallel(
          [
            [step("@executioncontrolprotocol/test.echo", "A").with({ value: "a" }).as("a")],
            [step("@executioncontrolprotocol/test.echo", "B").with({ value: "b" }).as("b")],
          ],
          { id: "parallel-1", label: "Run parallel" }
        ),
        branch([step("@executioncontrolprotocol/test.echo", "Yes").with({ value: "y" }).as("yes")], {
          id: "branch-1",
          label: "Choose",
        }),
        loop({ id: "loop-1", label: "Retry" }, [
          step("@executioncontrolprotocol/test.echo", "Try").with({ value: "t" }).as("try"),
        ]),
      ])
      .toManifest()
    const doc = workflowToReactFlow(manifest)
    expect(doc.nodes.every((n) => n.type === "ecp-step")).toBe(true)
    expect(doc.nodes).toHaveLength(5)
    expect(doc.edges.some((e) => e.data.kind === "control")).toBe(true)
  })

  it("renders empty workflow as an empty document", () => {
    const doc = workflowToReactFlow({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "empty-wf", label: "Empty" },
      steps: [],
    })
    expect(doc.nodes).toHaveLength(0)
    expect(doc.edges).toHaveLength(0)
  })

  it("marks ports unknown when capability is unbound", () => {
    const doc = workflowToReactFlow({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "u" },
      steps: [
        {
          id: "s1",
          uses: "@vendor/missing.thing",
          label: "Missing",
          input: { foo: 1 },
          as: "out",
        },
      ],
    })
    const stepNode = doc.nodes.find((n) => n.type === "ecp-step")!
    const data = stepNode.data as ReactFlowStepData
    expect(data.inputs.some((p) => p.name === "foo" && p.typeLabel === "unknown")).toBe(true)
    expect(data.inputs.find((p) => p.name === "foo")?.binding).toBe("literal")
    expect(data.inputs.find((p) => p.name === "foo")?.valueTitle).toBe("1")
    expect(data.outputs.some((p) => p.name === "output")).toBe(true)
  })

  it("publishes progress events from the shared bus", () => {
    const statuses: string[] = []
    const onStatus = (ev: Event) => {
      const detail = (ev as CustomEvent<{ stepId: string; status: string }>).detail
      statuses.push(`${detail.stepId}:${detail.status}`)
    }
    reactFlowRunProgress.addEventListener("step:status", onStatus)
    reactFlowRunProgress.emitStepStatus("s1", "running")
    reactFlowRunProgress.emitStepStatus("s1", "completed")
    reactFlowRunProgress.removeEventListener("step:status", onStatus)
    expect(statuses).toEqual(["s1:running", "s1:completed"])
  })

  it("emits progress during ecp.run via extension hooks", async () => {
    await registerFormatReactflowExtension()
    await registerTestExtension()
    const ecp = await initEncodingTestEcp([
      extension("@executioncontrolprotocol/format-reactflow").with({}),
      extension("@executioncontrolprotocol/test").with({}),
    ])
    const manifest = workflow("Run progress")
      .run([
        step("@executioncontrolprotocol/test.echo", "Echo")
          .with({ value: "hi" })
          .as("echo"),
      ])
      .toManifest()
    const stepId = (manifest.steps[0] as { id: string }).id
    const seen: string[] = []
    const onStatus = (ev: Event) => {
      const detail = (ev as CustomEvent<{ stepId: string; status: string }>).detail
      seen.push(`${detail.stepId}:${detail.status}`)
    }
    const onReset = vi.fn()
    const onDone = vi.fn()
    reactFlowRunProgress.addEventListener("step:status", onStatus)
    reactFlowRunProgress.addEventListener("run:reset", onReset)
    reactFlowRunProgress.addEventListener("run:done", onDone)
    await ecp.run(manifest)
    reactFlowRunProgress.removeEventListener("step:status", onStatus)
    reactFlowRunProgress.removeEventListener("run:reset", onReset)
    reactFlowRunProgress.removeEventListener("run:done", onDone)
    expect(onReset).toHaveBeenCalled()
    expect(seen.some((s) => s === `${stepId}:running` || s === `${stepId}:pending`)).toBe(true)
    expect(seen).toContain(`${stepId}:completed`)
    expect(onDone).toHaveBeenCalled()
    await ecp.terminate()
  })
})
