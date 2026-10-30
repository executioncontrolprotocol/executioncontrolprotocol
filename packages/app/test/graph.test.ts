import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  capabilityFor,
  defineExtension,
  parallel,
  ref,
  Registry,
  step,
  workflow,
} from "@executioncontrolprotocol/core"
import {
  extractDataEdges,
  longestMatchingPortId,
  parseStateRef,
  portsForStep,
  workflowToReactFlow,
  WORKFLOW_ACCEPTS_NODE_ID,
  WORKFLOW_RETURNS_NODE_ID,
  type ReactFlowIoData,
  type ReactFlowStepData,
} from "../src/graph/index.js"

describe("workflowToReactFlow", () => {
  it("encodes steps with ports and layout", () => {
    const manifest = workflow("Demo")
      .run([
        step("@executioncontrolprotocol/test.echo", "Echo")
          .with({ value: "x" })
          .as("echo"),
      ])
      .toManifest()
    const doc = workflowToReactFlow(manifest)
    const stepNode = doc.nodes.find((n) => n.type === "ecp-step")
    expect(stepNode).toBeDefined()
    const data = stepNode!.data as ReactFlowStepData
    expect(data.label).toBe("Echo")
    expect(data.inputs.some((p) => p.name === "value")).toBe(true)
    expect(typeof stepNode!.position.x).toBe("number")
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
    expect(edges).toHaveLength(1)
    expect(edges[0]!.data.kind).toBe("data")
    expect(edges[0]!.sourceHandle).toBe("echo")
    expect(edges[0]!.targetHandle).toBe("value")
  })

  it("does not invent data edges for unknown state keys", () => {
    const manifest = workflow("Missing as")
      .run([
        step("@executioncontrolprotocol/test.echo", "B")
          .with({ value: ref("nope") })
          .as("b"),
      ])
      .toManifest()
    expect(extractDataEdges(manifest.steps)).toHaveLength(0)
  })

  it("maps accepts keys to the Inputs node", () => {
    const manifest = workflow("From input")
      .run([
        step("@vendor/missing.generate", "Use")
          .id("use")
          .with({ prompt: ref("prompt") })
          .as("out"),
      ])
      .toManifest()
    const edges = extractDataEdges(manifest.steps, new Set(["prompt"]))
    expect(edges).toHaveLength(1)
    expect(edges[0]!.source).toBe(WORKFLOW_ACCEPTS_NODE_ID)
  })

  it("parses state refs", () => {
    expect(parseStateRef("state.a.echo")).toEqual({ asKey: "a", fieldPath: "echo" })
    expect(parseStateRef("a")).toEqual({ asKey: "a", fieldPath: "" })
    expect(parseStateRef("")).toBeUndefined()
  })

  it("lays out sequential steps without publishing control edges", () => {
    const manifest = workflow("Two steps")
      .run([
        step("@executioncontrolprotocol/test.echo", "Generate").with({ value: "a" }).as("email"),
        step("@executioncontrolprotocol/test.echo", "Extract").with({ value: "b" }).as("actions"),
      ])
      .toManifest()
    const doc = workflowToReactFlow(manifest)
    const steps = doc.nodes.filter((n) => n.type === "ecp-step")
    expect(steps).toHaveLength(2)
    expect(doc.edges.every((e) => e.data.kind === "data")).toBe(true)
    expect(steps[0]!.position.x).not.toBe(steps[1]!.position.x)
  })

  it("flattens parallel branches to step nodes", () => {
    const manifest = workflow("Flow")
      .run([
        parallel([
          [step("@executioncontrolprotocol/test.echo", "A").with({ value: "a" }).as("a")],
          [step("@executioncontrolprotocol/test.echo", "B").with({ value: "b" }).as("b")],
        ]),
      ])
      .toManifest()
    const doc = workflowToReactFlow(manifest)
    expect(doc.nodes.filter((n) => n.type === "ecp-step")).toHaveLength(2)
    expect(doc.nodes.some((n) => n.type === "ecp-group")).toBe(false)
  })

  it("projects accepts ports and $ref edges from the Inputs node", () => {
    const manifest = workflow("With input")
      .accepts({
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      })
      .run([
        step("@vendor/missing.generate", "Summarize")
          .id("summarize")
          .with({ prompt: ref("prompt") })
          .as("brief"),
      ])
      .toManifest()
    const doc = workflowToReactFlow(manifest)
    const io = doc.nodes.find((n) => n.id === WORKFLOW_ACCEPTS_NODE_ID)!.data as ReactFlowIoData
    expect(io.kind).toBe("accepts")
    expect(io.outputs.map((p) => p.id)).toEqual(["prompt"])
    const edge = doc.edges.find((e) => e.target === "summarize" && e.targetHandle === "prompt")
    expect(edge?.source).toBe(WORKFLOW_ACCEPTS_NODE_ID)
  })

  it("projects Outputs from returns and wires matching .as steps", () => {
    const manifest = workflow("With output")
      .returns({
        type: "object",
        properties: { brief: { type: "object" } },
        required: ["brief"],
      })
      .run([
        step("@vendor/missing.generate", "Summarize")
          .id("summarize")
          .with({ prompt: "x" })
          .as("brief"),
      ])
      .toManifest()
    const doc = workflowToReactFlow(manifest)
    const io = doc.nodes.find((n) => n.id === WORKFLOW_RETURNS_NODE_ID)!.data as ReactFlowIoData
    expect(io.kind).toBe("returns")
    expect(io.inputs[0]).toMatchObject({ binding: "ref", refPath: "brief" })
    expect(doc.edges.find((e) => e.target === WORKFLOW_RETURNS_NODE_ID)?.source).toBe("summarize")
  })

  it("wires nested output handles for dotted returns keys", async () => {
    const extension = defineExtension("@executioncontrolprotocol", "multi-out-fixture")
      .withConfig({})
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/multi-out-fixture", "inspect")
          .withInput(z.object({}))
          .withOutput(
            z.object({
              image: z.object({ locator: z.string() }),
              metadata: z.object({ aspectRatio: z.number() }),
            })
          )
          .withExecution("local")
          .withHandler(async () => ({
            image: { locator: "ecp://browser/x" },
            metadata: { aspectRatio: 1 },
          })),
      ])
      .build()
    const registry = new Registry()
    await registry.registerExtension(extension)
    const manifest = workflow("Sharp-like")
      .returns({
        type: "object",
        properties: { "inspected.metadata": { type: "object" } },
        required: ["inspected.metadata"],
      })
      .run([
        step("@executioncontrolprotocol/multi-out-fixture.inspect", "Inspect")
          .id("inspect")
          .with({})
          .as("inspected"),
      ])
      .toManifest()
    const doc = workflowToReactFlow(manifest, registry)
    const edge = doc.edges.find((item) => item.target === WORKFLOW_RETURNS_NODE_ID)
    expect(edge?.sourceHandle).toBe("metadata")
    expect(edge?.targetHandle).toBe("inspected.metadata")
  })

  it("attaches truncated literal binding metadata", () => {
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
    const data = doc.nodes.find((n) => n.type === "ecp-step")!.data as ReactFlowStepData
    const prompt = data.inputs.find((p) => p.name === "prompt")
    expect(prompt?.binding).toBe("literal")
    expect(prompt?.valueTitle).toBe(longPrompt)
    expect(prompt!.valuePreview!.endsWith("…")).toBe(true)
  })

  it("draws capability ports from describe JSON Schema without a registry", () => {
    const manifest = workflow("Schema")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").as("echo")])
      .toManifest()
    const doc = workflowToReactFlow(manifest, undefined, {
      capabilitySchemas: {
        "@executioncontrolprotocol/test.echo": {
          inputSchema: {
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
          },
          outputSchema: {
            type: "object",
            properties: { echo: { type: "string" } },
            required: ["echo"],
          },
        },
      },
    })
    const data = doc.nodes.find((n) => n.type === "ecp-step")!.data as ReactFlowStepData
    expect(data.inputs.find((p) => p.name === "value")?.typeLabel).toBe("string!")
    expect(data.outputs.find((p) => p.name === "echo")?.typeLabel).toBe("string!")
  })

  it("exposes nested object primitives and leaves arrays as one output port", async () => {
    const extension = defineExtension("@executioncontrolprotocol", "nested-out-fixture")
      .withConfig({})
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/nested-out-fixture", "inspect")
          .withInput(z.object({}))
          .withOutput(
            z.object({
              image: z.object({ locator: z.string() }),
              metadata: z.object({ aspectRatio: z.number() }),
            })
          )
          .withExecution("local")
          .withHandler(async () => ({
            image: { locator: "ecp://browser/x" },
            metadata: { aspectRatio: 1 },
          })),
        capabilityFor("@executioncontrolprotocol/nested-out-fixture", "generate")
          .withInput(z.object({ prompt: z.string() }))
          .withOutput(
            z.object({
              outputs: z.array(z.object({ seed: z.number(), image: z.object({ url: z.string() }) })),
            })
          )
          .withExecution("local")
          .withHandler(async () => ({ outputs: [{ seed: 1, image: { url: "https://example.test/a.png" } }] })),
      ])
      .build()
    const registry = new Registry()
    await registry.registerExtension(extension)

    const inspectPorts = portsForStep(
      {
        id: "inspect",
        uses: "@executioncontrolprotocol/nested-out-fixture.inspect",
        as: "inspected",
      },
      registry
    )
    expect(inspectPorts.outputs.map((p) => p.id)).toEqual([
      "output",
      "image",
      "image.locator",
      "metadata",
      "metadata.aspectRatio",
    ])
    expect(inspectPorts.outputs.find((p) => p.id === "image.locator")?.typeLabel).toBe("string!")

    const generatePorts = portsForStep(
      {
        id: "generate",
        uses: "@executioncontrolprotocol/nested-out-fixture.generate",
        as: "generate",
      },
      registry
    )
    expect(generatePorts.outputs.map((p) => p.id)).toEqual(["output", "outputs"])
    expect(generatePorts.outputs.find((p) => p.id === "outputs")?.typeLabel).toBe("array!")
    expect(generatePorts.outputs.some((p) => p.id === "url" || p.id.startsWith("outputs.0"))).toBe(
      false
    )

    const inspectManifest = workflow("Inspect ref")
      .run([
        step("@executioncontrolprotocol/nested-out-fixture.inspect", "Inspect")
          .id("inspect")
          .with({})
          .as("inspected"),
        step("@executioncontrolprotocol/test.echo", "Use")
          .id("use")
          .with({ value: ref("inspected.image.locator") })
          .as("used"),
      ])
      .toManifest()
    const inspectDoc = workflowToReactFlow(inspectManifest, registry)
    const locatorEdge = inspectDoc.edges.find((item) => item.target === "use")
    expect(locatorEdge?.sourceHandle).toBe("image.locator")
  })

  it("wires a deep array ref to the array port, not a fake item handle", async () => {
    const extension = defineExtension("@executioncontrolprotocol", "array-ref-fixture")
      .withConfig({})
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/array-ref-fixture", "generate")
          .withInput(z.object({ prompt: z.string() }))
          .withOutput(
            z.object({
              outputs: z.array(z.object({ image: z.object({ url: z.string() }) })),
            })
          )
          .withExecution("local")
          .withHandler(async () => ({ outputs: [{ image: { url: "https://example.test/a.png" } }] })),
        capabilityFor("@executioncontrolprotocol/array-ref-fixture", "use-url")
          .withInput(z.object({ url: z.string() }))
          .withOutput(z.object({ ok: z.boolean() }))
          .withExecution("local")
          .withHandler(async () => ({ ok: true })),
      ])
      .build()
    const registry = new Registry()
    await registry.registerExtension(extension)
    const manifest = workflow("Deep ref")
      .run([
        step("@executioncontrolprotocol/array-ref-fixture.generate", "Generate")
          .id("generate")
          .with({ prompt: "x" })
          .as("generate"),
        step("@executioncontrolprotocol/array-ref-fixture.use-url", "Use")
          .id("use")
          .with({ url: ref("generate.outputs.0.image.url") })
          .as("used"),
      ])
      .toManifest()
    const doc = workflowToReactFlow(manifest, registry)
    const edge = doc.edges.find((item) => item.target === "use")
    expect(edge?.sourceHandle).toBe("outputs")
    expect(edge?.targetHandle).toBe("url")
  })
})

describe("longestMatchingPortId", () => {
  it("prefers the longest dotted prefix", () => {
    expect(longestMatchingPortId("image.locator", ["output", "image", "image.locator"])).toBe(
      "image.locator"
    )
    expect(longestMatchingPortId("outputs.0.image.url", ["output", "outputs"])).toBe("outputs")
    expect(longestMatchingPortId("echo", undefined)).toBe("echo")
    expect(longestMatchingPortId("")).toBe("output")
  })
})
