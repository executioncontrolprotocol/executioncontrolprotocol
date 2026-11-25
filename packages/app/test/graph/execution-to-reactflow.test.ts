import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  EXECUTION_ACCEPTS_NODE_ID,
  EXECUTION_RETURNS_NODE_ID,
  executionToReactFlow,
  LOOP_COLLECT_HANDLE,
  LOOP_INTO_HANDLE,
  LOOP_ITEM_HANDLE,
  LOOP_REF_HANDLE,
  type ReactFlowDocument,
  type ReactFlowEdge,
  type ReactFlowLoopItemsData,
  type ReactFlowIoData,
  type ReactFlowFrameData,
  type ReactFlowNode,
  type ReactFlowRouteEdgeData,
  type ReactFlowStepData,
} from "../../src/graph/index.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const validDir = path.resolve(here, "../../../../fixtures/manifests/valid")
const fixtureNames = readdirSync(validDir).filter((name) => name.endsWith(".ecp.json")).sort()

function load(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(validDir, name), "utf8")) as ExecutionManifest
}

function routeEdges(doc: ReactFlowDocument): Array<ReactFlowEdge & { data: ReactFlowRouteEdgeData }> {
  return doc.edges.filter((edge): edge is ReactFlowEdge & { data: ReactFlowRouteEdgeData } => edge.data.kind === "route")
}

function dataEdges(doc: ReactFlowDocument): ReactFlowEdge[] {
  return doc.edges.filter((edge) => edge.data.kind === "data")
}

function step(doc: ReactFlowDocument, id: string): ReactFlowStepData {
  const node = doc.nodes.find((n) => n.id === id)
  if (!node || node.type !== "ecp-step") throw new Error(`no step ${id}`)
  return node.data as ReactFlowStepData
}

function stepIds(manifestNodes: unknown[], out: string[] = []): string[] {
  for (const node of manifestNodes as Array<Record<string, unknown>>) {
    if (node.type === undefined || node.type === "step") out.push(node.id as string)
    else if (node.type === "parallel") for (const line of node.branches as unknown[][]) stepIds(line, out)
    else if (node.type === "branch") {
      for (const arm of node.branches as Array<{ steps: unknown[] }>) stepIds(arm.steps, out)
    } else if (node.type === "loop") {
      out.push(node.id as string)
      stepIds(node.steps as unknown[], out)
    } else stepIds(node.steps as unknown[], out)
  }
  return out
}

describe("executionToReactFlow over fixtures/manifests/valid", () => {
  it("finds the fixtures", () => {
    expect(fixtureNames.length).toBeGreaterThanOrEqual(10)
  })

  it.each(fixtureNames)("%s encodes every step, an Inputs node and no control edges", (name) => {
    const manifest = load(name)
    const doc = executionToReactFlow(manifest)
    const ids = doc.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(EXECUTION_ACCEPTS_NODE_ID)
    for (const id of stepIds(manifest.steps)) expect(ids).toContain(id)
    for (const edge of doc.edges) {
      expect(edge.data.kind).not.toBe("control")
      expect(ids).toContain(edge.source)
      expect(ids).toContain(edge.target)
    }
    for (const node of doc.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
    }
    const edgeIds = doc.edges.map((e) => e.id)
    expect(new Set(edgeIds).size).toBe(edgeIds.length)
  })

  it.each(fixtureNames)("%s has a handle on each end of every data edge", (name) => {
    const doc = executionToReactFlow(load(name))
    const byId = new Map(doc.nodes.map((n) => [n.id, n]))
    for (const edge of dataEdges(doc)) {
      const sourceNode = byId.get(edge.source)
      const targetNode = byId.get(edge.target)
      const sourceOutputs =
        sourceNode?.type === "ecp-loop"
          ? (sourceNode.data as ReactFlowLoopItemsData).outputs
          : (sourceNode?.data as ReactFlowStepData | ReactFlowIoData).outputs
      const targetInputs =
        targetNode?.type === "ecp-loop"
          ? (targetNode.data as ReactFlowLoopItemsData).inputs
          : (targetNode?.data as ReactFlowStepData | ReactFlowIoData).inputs
      expect(sourceOutputs.map((p) => p.id)).toContain(edge.sourceHandle)
      expect(targetInputs.map((p) => p.id)).toContain(edge.targetHandle)
    }
  })
})

describe("route edges", () => {
  it("branch: one labelled route per arm, with expr text and a default arm", () => {
    const doc = executionToReactFlow(load("branch.ecp.json"))
    const routes = routeEdges(doc).filter((e) => e.data.route === "branch")
    expect(routes.map((e) => e.target).sort()).toEqual(["no", "yes"])
    const yes = routes.find((e) => e.target === "yes")!
    expect(yes.source).toBe(EXECUTION_ACCEPTS_NODE_ID)
    expect(yes.data).toMatchObject({ structureId: "route", armIndex: 0, label: "yes", exprBadge: "state.on === true", stepIds: ["yes"] })
    const no = routes.find((e) => e.target === "no")!
    expect(no.data).toMatchObject({ armIndex: 1, label: "default", defaultArm: true })
    expect(no.data.exprBadge).toBeUndefined()
  })

  it("parallel: one route per line", () => {
    const doc = executionToReactFlow(load("parallel.ecp.json"))
    const routes = routeEdges(doc)
    expect(routes).toHaveLength(2)
    expect(routes.map((e) => [e.target, e.data.route, e.data.armIndex])).toEqual([
      ["left", "parallel", 0],
      ["right", "parallel", 1],
    ])
    expect(routes.every((e) => e.data.label === undefined)).toBe(true)
  })

  it("loop: head node, entry route with expr and maxRounds plus loop-back to head", () => {
    const doc = executionToReactFlow(load("loop.ecp.json"))
    expect(doc.nodes.some((n) => n.type === "ecp-loop" && n.id === "refine")).toBe(true)
    const routes = routeEdges(doc)
    const entry = routes.find((e) => !e.data.loopBack && e.source === EXECUTION_ACCEPTS_NODE_ID)!
    const intoBody = routes.find((e) => !e.data.loopBack && e.source === "refine")!
    const back = routes.find((e) => e.data.loopBack)!
    expect(entry).toMatchObject({ target: "refine" })
    expect(intoBody).toMatchObject({ target: "tick" })
    expect(entry.data).toMatchObject({ route: "loop", structureId: "refine", maxRounds: 2, exprBadge: "state.tick === undefined" })
    expect(back).toMatchObject({ source: "tick", target: "refine" })
  })

  it("nested: parallel line enters a loop whose body is a branch", () => {
    const doc = executionToReactFlow(load("nested.ecp.json"))
    const routes = routeEdges(doc)
    expect(routes.some((e) => e.data.route === "parallel" && e.target === "inner")).toBe(true)
    expect(routes.some((e) => e.data.route === "parallel" && e.target === "side")).toBe(true)
    expect(routes.some((e) => e.data.route === "loop" && e.data.loopBack && e.target === "inner")).toBe(true)
  })

  it("sequence after a structure uses route edges into the next structure", () => {
    const doc = executionToReactFlow(load("localize-banner.ecp.json"))
    const routes = routeEdges(doc)
    const intoBranch = routes.filter((e) => e.data.route === "branch")
    expect(intoBranch.every((e) => e.source === "translate")).toBe(true)
    const intoParallel = routes.filter((e) => e.data.route === "parallel")
    expect(new Set(intoParallel.map((e) => e.source))).toEqual(new Set(["filled", "kept"]))
    const intoLoop = routes.filter((e) => e.data.route === "loop" && !e.data.loopBack)
    expect(new Set(intoLoop.map((e) => e.source))).toEqual(new Set(["copy", "refine", "script"]))
  })

  it("sequential literal-only steps get sequence route edges when otherwise orphaned", () => {
    const doc = executionToReactFlow(load("commit-modes.ecp.json"))
    expect(doc.edges.every((e) => e.data.kind === "route" && (e.data as ReactFlowRouteEdgeData).route === "sequence")).toBe(
      true,
    )
    expect(doc.nodes).toHaveLength(5)
  })
})

describe("data edges and ports", () => {
  it("markers: $ref, transform output and $script inputs bind ports; $ref reads draw edges", () => {
    const doc = executionToReactFlow(load("markers.ecp.json"))
    const marked = step(doc, "marked")
    const byName = new Map(marked.inputs.map((p) => [p.name, p]))
    expect(byName.get("fromRef")).toMatchObject({ binding: "ref", refPath: "seed.echo", refOptional: true })
    expect(byName.get("fromTransform")).toMatchObject({ binding: "ref", refPath: "fromExpr.value" })
    expect(byName.get("handle")).toMatchObject({ binding: "ref", refPath: "bucket" })
    expect(byName.get("script")).toMatchObject({ binding: "script", scriptSource: "1" })

    const edges = dataEdges(doc)
    expect(edges.find((e) => e.targetHandle === "fromRef")).toMatchObject({ source: "seed", target: "marked", sourceHandle: "echo" })
    expect(edges.find((e) => e.targetHandle === "fromTransform")).toMatchObject({
      source: "fromExpr",
      target: "marked",
      sourceHandle: "value",
    })
    expect(edges.some((e) => e.targetHandle === "handle")).toBe(false)
  })

  it("script-path: binding carries the path", () => {
    const doc = executionToReactFlow(load("script-path.ecp.json"))
    expect(step(doc, "scripted").inputs[0]).toMatchObject({ name: "text", binding: "script", scriptPath: "banner.js" })
  })

  it("accepts keys feed data edges from the Inputs node", () => {
    const doc = executionToReactFlow(load("localize-banner.ecp.json"))
    const fromAccepts = dataEdges(doc).filter((e) => e.source === EXECUTION_ACCEPTS_NODE_ID)
    expect(fromAccepts).toContainEqual(
      expect.objectContaining({ target: "doc", sourceHandle: "headline", targetHandle: "value.headline" }),
    )
    expect(fromAccepts).toContainEqual(expect.objectContaining({ target: "doc", sourceHandle: "locale", targetHandle: "value.locale" }))
    expect(fromAccepts).toContainEqual(expect.objectContaining({ target: "translate", sourceHandle: "locale", targetHandle: "expr" }))
  })

  it("nested $ref under a literal adds dotted ports and keeps the literal preview", () => {
    const doc = executionToReactFlow(load("localize-banner.ecp.json"))
    const inputs = step(doc, "doc").inputs
    expect(inputs.find((p) => p.name === "value")).toMatchObject({ binding: "literal" })
    expect(inputs.find((p) => p.name === "value.headline")).toMatchObject({ binding: "ref", refPath: "headline" })
  })

  it("nested $script inside a literal gets its own script port", () => {
    const doc = executionToReactFlow(load("localize-banner.ecp.json"))
    const port = step(doc, "script").inputs.find((p) => p.name === "options.uxp.source.content")
    expect(port).toMatchObject({ binding: "script", scriptPath: "banner.js" })
  })

  it("step expr gate: badge, expr port and edges from the state it reads", () => {
    const doc = executionToReactFlow(load("localize-banner.ecp.json"))
    const translate = step(doc, "translate")
    expect(translate.exprBadge).toBe("state.locale !== 'en'")
    expect(translate.config).toBe("anthropic/default")
    expect(translate.mode).toBe("replace")
    expect(translate.inputs.find((p) => p.id === "expr")).toMatchObject({ binding: "expr" })
  })

  it("transform output feeds capability inputs through $ref edges", () => {
    const doc = executionToReactFlow(load("localize-banner.ecp.json"))
    const edge = dataEdges(doc).find((e) => e.target === "translate" && e.targetHandle === "prompt")
    expect(edge).toMatchObject({ source: "prompt", sourceHandle: "prompt" })
  })

  it("$ref reads use the last earlier writer of the key", () => {
    const doc = executionToReactFlow(load("localize-banner.ecp.json"))
    const edge = dataEdges(doc).find((e) => e.target === "localized")
    expect(edge).toMatchObject({ source: "doc", sourceHandle: "echo" })
  })

  it("returns: Outputs node with edges from the writing steps", () => {
    const doc = executionToReactFlow(load("localize-banner.ecp.json"))
    const returnsNode = doc.nodes.find((n) => n.id === EXECUTION_RETURNS_NODE_ID)
    expect((returnsNode?.data as ReactFlowIoData).inputs.map((p) => [p.id, p.binding])).toEqual([
      ["localized", "ref"],
      ["banner", "ref"],
    ])
    const intoReturns = dataEdges(doc).filter((e) => e.target === EXECUTION_RETURNS_NODE_ID)
    expect(intoReturns.map((e) => [e.source, e.targetHandle])).toEqual([
      ["localized", "localized"],
      ["banner", "banner"],
    ])
  })

  it("optional-fallback: expr gate port stays editable when the gate is false", () => {
    const doc = executionToReactFlow(load("optional-fallback.ecp.json"))
    expect(step(doc, "gated").inputs.find((p) => p.id === "expr")).toMatchObject({
      binding: "expr",
      exprSource: "(state) => false",
    })
  })

  it("optional-fallback: gated step, then a ref to its key", () => {
    const doc = executionToReactFlow(load("optional-fallback.ecp.json"))
    expect(step(doc, "gated").exprBadge).toBe("false")
    expect(dataEdges(doc)).toEqual([expect.objectContaining({ source: "gated", target: "echo", sourceHandle: "output" })])
  })

  it("loop expr on the head node draws edges from state the expr reads", () => {
    const doc = executionToReactFlow(load("loop.ecp.json"))
    expect(dataEdges(doc)).toContainEqual(
      expect.objectContaining({
        target: "refine",
        targetHandle: "expr",
        source: "tick",
        sourceHandle: "output",
      }),
    )
  })

  it("for loop: head node, item edge and ref driver", () => {
    const doc = executionToReactFlow(load("loop-for.ecp.json"))
    expect(doc.nodes.some((n) => n.id === "rounds" && n.type === "ecp-loop")).toBe(true)
    expect(dataEdges(doc)).toContainEqual(
      expect.objectContaining({
        source: EXECUTION_ACCEPTS_NODE_ID,
        target: "rounds",
        targetHandle: LOOP_REF_HANDLE,
      }),
    )
    expect(dataEdges(doc)).toContainEqual(
      expect.objectContaining({
        source: "rounds",
        sourceHandle: LOOP_ITEM_HANDLE,
        target: "tick",
      }),
    )
  })
})

describe("capability schemas", () => {
  const manifest: ExecutionManifest = {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      { id: "a", uses: "@x/p.make", input: { size: 3 }, as: "made" },
      { id: "b", uses: "@x/p.use", input: { title: { $ref: "state.made.meta.title" } } },
    ],
  }
  const capabilitySchemas = {
    "@x/p.make": {
      accepts: { type: "object", properties: { size: { type: "integer" }, mode: { type: "string", enum: ["a"] } }, required: ["size"] },
      returns: {
        type: "object",
        properties: { meta: { type: "object", properties: { title: { type: "string" } } }, items: { type: "array" } },
        required: ["meta"],
      },
    },
  }

  it("types ports from accepts / returns and nests output paths", () => {
    const doc = executionToReactFlow(manifest, { capabilitySchemas })
    const a = step(doc, "a")
    expect(a.inputs.map((p) => [p.id, p.typeLabel, p.binding])).toEqual([
      ["size", "integer!", "literal"],
      ["mode", "string", undefined],
    ])
    expect(a.outputs.map((p) => p.id)).toEqual(["output", "meta", "meta.title", "items"])
    expect(dataEdges(doc)[0]).toMatchObject({ source: "a", sourceHandle: "meta.title", target: "b", targetHandle: "title" })
  })

  it("without schemas falls back to the first ref segment and creates the port", () => {
    const doc = executionToReactFlow(manifest)
    expect(step(doc, "a").outputs.map((p) => p.id)).toEqual(["output", "meta"])
    expect(step(doc, "b").inputs[0]).toMatchObject({ id: "title", typeLabel: "unknown", binding: "ref", refPath: "made.meta.title" })
  })

  it("honours TB direction and custom sizes", () => {
    const lr = executionToReactFlow(manifest)
    const tb = executionToReactFlow(manifest, { direction: "TB", nodeWidth: 100, nodeHeight: 50 })
    const lrA = lr.nodes.find((n) => n.id === "a")!
    const lrB = lr.nodes.find((n) => n.id === "b")!
    const tbA = tb.nodes.find((n) => n.id === "a")!
    const tbB = tb.nodes.find((n) => n.id === "b")!
    expect(lrB.position.x).toBeGreaterThan(lrA.position.x)
    expect(tbB.position.y).toBeGreaterThan(tbA.position.y)
    expect(tbA.style?.width).toBe(100)
  })
})

describe("forEach loop graph", () => {
  function loopItemsNode(doc: ReactFlowDocument, id: string): ReactFlowLoopItemsData {
    const node = doc.nodes.find((n) => n.id === id)
    if (!node || node.type !== "ecp-loop") throw new Error(`no forEach loop ${id}`)
    return node.data as ReactFlowLoopItemsData
  }

  it("renders a structure node, frame, route entry and data ports", () => {
    const doc = executionToReactFlow(load("loop-foreach.ecp.json"))
    expect(doc.nodes.some((n) => n.type === "ecp-loop" && n.id === "rows")).toBe(true)
    const frame = doc.nodes.find((n) => n.type === "ecp-frame" && (n.data as ReactFlowFrameData).structureId === "rows")
    expect(frame).toBeDefined()
    expect((frame?.data as ReactFlowFrameData).label).toBe("forEach ×2")
    const routes = routeEdges(doc).filter((e) => e.data.route === "loop" && e.data.loopMode === "forEach")
    expect(routes.some((e) => e.source === "rows" && e.target === "echo")).toBe(true)
    expect(routes.every((e) => !e.data.loopBack)).toBe(true)
    const ports = loopItemsNode(doc, "rows")
    expect(ports.inputs.map((p) => p.id).sort()).toEqual([LOOP_COLLECT_HANDLE, LOOP_REF_HANDLE].sort())
    expect(ports.outputs.map((p) => p.id).sort()).toEqual([LOOP_INTO_HANDLE, LOOP_ITEM_HANDLE].sort())
  })

  it("wires ref and collect and exposes into from the loop node", () => {
    const doc = executionToReactFlow(load("loop-foreach.ecp.json"))
    const edges = dataEdges(doc)
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: "pack",
        target: "rows",
        targetHandle: LOOP_REF_HANDLE,
        sourceHandle: "rows",
      }),
    )
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: "echo",
        target: "rows",
        targetHandle: LOOP_COLLECT_HANDLE,
        sourceHandle: "output",
      }),
    )
  })

  it("does not source body commit keys outside the frame", () => {
    const manifest = load("loop-foreach.ecp.json")
    manifest.steps = [
      ...manifest.steps,
      {
        id: "peek",
        uses: "@executioncontrolprotocol/test.echo",
        input: { value: { $ref: "state.echoed" } },
      } as (typeof manifest.steps)[number],
    ]
    const doc = executionToReactFlow(manifest)
    expect(dataEdges(doc).some((e) => e.target === "peek")).toBe(false)
  })

  it("sources state.into from the loop node", () => {
    const manifest = load("loop-foreach.ecp.json")
    manifest.steps = [
      ...manifest.steps,
      {
        id: "after",
        uses: "@executioncontrolprotocol/test.echo",
        input: { value: { $ref: "state.results" } },
      } as (typeof manifest.steps)[number],
    ]
    const doc = executionToReactFlow(manifest)
    expect(dataEdges(doc)).toContainEqual(
      expect.objectContaining({ source: "rows", sourceHandle: LOOP_INTO_HANDLE, target: "after" }),
    )
  })

  it("supports a while loop nested in a forEach loop body", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          ref: "state.list",
          as: "item",
          steps: [
            {
              type: "loop",
              id: "rounds",
              expr: "(state) => (state.tick ?? 0) < 2",
              maxRounds: 3,
              steps: [{ id: "tick", uses: "@executioncontrolprotocol/test.echo", as: "tick" }],
            },
          ],
          collect: "state.tick",
          into: "ticks",
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    expect(routeEdges(doc).some((e) => e.data.route === "loop" && e.data.loopBack)).toBe(true)
    expect(routeEdges(doc).some((e) => e.data.route === "loop" && e.data.loopMode === "forEach")).toBe(true)
  })
})

describe("parallel frames", () => {
  function frameNodes(doc: ReactFlowDocument) {
    return doc.nodes.filter((node) => node.type === "ecp-frame")
  }

  function stepNode(doc: ReactFlowDocument, id: string) {
    return doc.nodes.find((n) => n.id === id)!
  }

  const encloses = (frame: ReactFlowNode, step: ReactFlowNode): boolean => {
    const fw = (frame.style?.width as number | undefined) ?? 0
    const fh = (frame.style?.height as number | undefined) ?? 0
    return (
      step.position.x >= frame.position.x &&
      step.position.y >= frame.position.y &&
      step.position.x + 260 <= frame.position.x + fw &&
      step.position.y + 160 <= frame.position.y + fh
    )
  }

  it("adds one frame per parallel node that encloses every line's steps", () => {
    const doc = executionToReactFlow(load("parallel.ecp.json"))
    const frames = frameNodes(doc)
    // One frame (and one label) for the whole parallel, not one per line.
    expect(frames).toHaveLength(1)
    for (const stepId of ["left", "right"]) expect(encloses(frames[0]!, stepNode(doc, stepId))).toBe(true)
  })

  it("puts the full parallel label on the frame, not on route edges", () => {
    const manifest = load("parallel.ecp.json")
    manifest.steps[0] = { ...manifest.steps[0], label: "Prepare both sides in parallel" } as (typeof manifest.steps)[0]
    const doc = executionToReactFlow(manifest)
    const frame = frameNodes(doc)[0]!
    expect((frame.data as ReactFlowFrameData).label).toBe("Prepare both sides in parallel")
    expect(routeEdges(doc).every((e) => e.data.label === undefined)).toBe(true)
  })

  it("branch and loop fixtures gain no frame", () => {
    expect(frameNodes(executionToReactFlow(load("branch.ecp.json")))).toHaveLength(0)
    expect(frameNodes(executionToReactFlow(load("loop.ecp.json")))).toHaveLength(0)
    expect(frameNodes(executionToReactFlow(load("loop-for.ecp.json")))).toHaveLength(0)
  })

  it("a parallel whose line holds a loop and a branch still gets one enclosing frame", () => {
    // nested.ecp.json: parallel `outer` with lines [loop > branch > step `nested`] and [step `side`].
    const doc = executionToReactFlow(load("nested.ecp.json"))
    const frames = frameNodes(doc)
    expect(frames).toHaveLength(1)
    for (const stepId of ["nested", "side"]) expect(encloses(frames[0]!, stepNode(doc, stepId))).toBe(true)
  })
})

describe("edge cases", () => {
  it("empty steps still yields the Inputs node", () => {
    const doc = executionToReactFlow({ schema: "@executioncontrolprotocol.execution", version: "2.0", steps: [] })
    expect(doc.nodes.map((n) => n.id)).toEqual([EXECUTION_ACCEPTS_NODE_ID])
    expect(doc.edges).toEqual([])
  })

  it("missing steps array is treated as empty", () => {
    const manifest = { schema: "@executioncontrolprotocol.execution", version: "2.0" } as unknown as ExecutionManifest
    expect(executionToReactFlow(manifest).nodes).toHaveLength(1)
  })

  it("returns-only execution connects Inputs to Outputs and maps accepts keys", () => {
    const doc = executionToReactFlow({
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: {
        accepts: { type: "object", properties: { name: { type: "string" } } },
        returns: { type: "object", properties: { name: { type: "string" }, other: { type: "string" } } },
      },
      steps: [],
    })
    expect(doc.nodes.map((n) => n.id)).toEqual([EXECUTION_ACCEPTS_NODE_ID, EXECUTION_RETURNS_NODE_ID])
    expect(dataEdges(doc)).toEqual([
      expect.objectContaining({ source: EXECUTION_ACCEPTS_NODE_ID, target: EXECUTION_RETURNS_NODE_ID, sourceHandle: "name" }),
    ])
    const outputs = doc.nodes[1]!.data as ReactFlowIoData
    expect(outputs.inputs.find((p) => p.id === "other")?.binding).toBeUndefined()
  })

  it("refs to unknown keys draw no edge", () => {
    const doc = executionToReactFlow({
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "a", uses: "@x/p.c", input: { v: { $ref: "state.nowhere" } } }],
    })
    expect(dataEdges(doc)).toEqual([])
    expect(step(doc, "a").inputs[0]).toMatchObject({ binding: "ref", refPath: "nowhere" })
  })

  it("step labels default to the id and use the label when set", () => {
    const doc = executionToReactFlow(load("localize-banner.ecp.json"))
    expect(step(doc, "translate").label).toBe("Translate headline")
    expect(step(doc, "doc").label).toBe("doc")
  })
})
