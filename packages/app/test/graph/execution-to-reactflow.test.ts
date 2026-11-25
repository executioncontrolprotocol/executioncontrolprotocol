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

function routeBetween(doc: ReactFlowDocument, source: string, target: string): ReactFlowRouteEdgeData {
  const edge = routeEdges(doc).find((e) => e.source === source && e.target === target)
  if (!edge) throw new Error(`no route edge ${source} -> ${target}`)
  return edge.data
}

function expectFlatMatchesLevel0(data: ReactFlowRouteEdgeData): void {
  const l0 = data.levels[0]
  expect(l0).toBeDefined()
  expect(data.route).toBe(l0!.route)
  expect(data.structureId).toBe(l0!.structureId)
  expect(data.armIndex).toBe(l0!.armIndex)
  expect(data.label).toBe(l0!.label)
  expect(data.exprBadge).toBe(l0!.exprBadge)
  expect(data.exprSource).toBe(l0!.exprSource)
  expect(data.defaultArm).toBe(l0!.defaultArm)
  expect(data.maxRounds).toBe(l0!.maxRounds)
  expect(data.loopMode).toBe(l0!.loopMode)
  expect(data.stepIds).toEqual(l0!.stepIds)
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

  it("nested branch: each arm keeps outer and inner levels on edges from the prefix step", () => {
    const doc = executionToReactFlow(load("nested-branch.ecp.json"))
    const toX = routeBetween(doc, "a", "x")
    expect(toX.levels).toHaveLength(2)
    expect(toX.levels[0]).toMatchObject({
      route: "branch",
      structureId: "outer",
      armIndex: 0,
      label: "outer",
      exprBadge: "true",
      exprSource: "(state) => true",
      stepIds: ["x", "w"],
    })
    expect(toX.levels[1]).toMatchObject({
      route: "branch",
      structureId: "inner",
      armIndex: 0,
      label: "inner",
      exprBadge: "1 === 1",
      exprSource: "(state) => 1 === 1",
      stepIds: ["x"],
    })
    expectFlatMatchesLevel0(toX)

    const toW = routeBetween(doc, "a", "w")
    expect(toW.levels[0]).toMatchObject({ structureId: "outer", armIndex: 0, label: "outer", exprSource: "(state) => true" })
    expect(toW.levels[1]).toMatchObject({ structureId: "inner", armIndex: 1, defaultArm: true, stepIds: ["w"] })
    expect(toW.levels[1]?.label).toBeUndefined()
    expect(toW.levels[1]?.exprBadge).toBeUndefined()
    expect(toW.levels[1]?.exprSource).toBeUndefined()

    const toN = routeBetween(doc, "a", "n")
    expect(toN.levels).toHaveLength(1)
    expect(toN.levels[0]).toMatchObject({ structureId: "outer", armIndex: 1, defaultArm: true, stepIds: ["n"] })
    expectFlatMatchesLevel0(toN)
  })

  it("branch arm into while loop: branch level then loop level on the head entry edge", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "pick",
          branches: [
            {
              label: "go",
              expr: "(state) => state.on",
              steps: [
                {
                  type: "loop",
                  id: "spin",
                  expr: "(state) => state.tick",
                  maxRounds: 3,
                  steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" } }],
                },
              ],
            },
            { steps: [{ id: "skip", uses: "@executioncontrolprotocol/test.echo", input: { value: "s" } }] },
          ],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const intoHead = routeBetween(doc, EXECUTION_ACCEPTS_NODE_ID, "spin")
    expect(intoHead.levels).toHaveLength(2)
    expect(intoHead.levels[0]).toMatchObject({ route: "branch", structureId: "pick", armIndex: 0, label: "go" })
    expect(intoHead.levels[1]).toMatchObject({ route: "loop", structureId: "spin", loopMode: "while", maxRounds: 3 })
    expectFlatMatchesLevel0(intoHead)
    const intoBody = routeBetween(doc, "spin", "body")
    expect(intoBody.levels).toHaveLength(1)
    expect(intoBody.levels[0]).toMatchObject({ route: "loop", structureId: "spin" })
    expect(intoBody.structureId).toBe("spin")
    const back = routeEdges(doc).find((e) => e.data.loopBack)!
    expect(back.data.levels).toHaveLength(1)
    expect(back.data.levels[0]).toMatchObject({ route: "loop", structureId: "spin" })
  })

  it("branch arm into for loop carries ref badge on the inner loop level", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "pick",
          branches: [
            {
              expr: "(state) => true",
              steps: [
                {
                  type: "loop",
                  mode: "for",
                  id: "rounds",
                  ref: "state.items",
                  as: "item",
                  steps: [{ id: "tick", uses: "@executioncontrolprotocol/test.echo", input: { value: "t" } }],
                },
              ],
            },
            { steps: [{ id: "other", uses: "@executioncontrolprotocol/test.echo", input: { value: "o" } }] },
          ],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const intoHead = routeBetween(doc, EXECUTION_ACCEPTS_NODE_ID, "rounds")
    expect(intoHead.levels).toHaveLength(2)
    expect(intoHead.levels[1]).toMatchObject({ loopMode: "for", exprBadge: "ref: state.items" })
  })

  it("branch arm into forEach: head entry is branch level only; body edge is forEach loop level", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "pick",
          branches: [
            {
              expr: "(state) => state.go",
              steps: [
                {
                  type: "loop",
                  mode: "forEach",
                  id: "each",
                  ref: "state.items",
                  as: "item",
                  into: "out",
                  steps: [{ id: "work", uses: "@executioncontrolprotocol/test.echo", input: { value: "w" } }],
                },
              ],
            },
            { steps: [{ id: "idle", uses: "@executioncontrolprotocol/test.echo", input: { value: "i" } }] },
          ],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const intoHead = routeBetween(doc, EXECUTION_ACCEPTS_NODE_ID, "each")
    expect(intoHead.levels).toHaveLength(1)
    expect(intoHead.levels[0]).toMatchObject({ route: "branch", structureId: "pick", armIndex: 0 })
    expect(intoHead.levels[0]?.loopMode).toBeUndefined()
    const intoBody = routeBetween(doc, "each", "work")
    expect(intoBody.levels).toHaveLength(1)
    expect(intoBody.levels[0]).toMatchObject({ route: "loop", loopMode: "forEach", structureId: "each" })
  })

  it("branch arm into parallel composes branch and parallel levels", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "pick",
          branches: [
            {
              expr: "(state) => state.a",
              steps: [
                {
                  type: "parallel",
                  id: "both",
                  branches: [
                    [{ id: "left", uses: "@executioncontrolprotocol/test.echo", input: { value: "l" } }],
                    [{ id: "right", uses: "@executioncontrolprotocol/test.echo", input: { value: "r" } }],
                  ],
                },
              ],
            },
            { steps: [{ id: "solo", uses: "@executioncontrolprotocol/test.echo", input: { value: "s" } }] },
          ],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const toLeft = routeBetween(doc, EXECUTION_ACCEPTS_NODE_ID, "left")
    expect(toLeft.levels).toHaveLength(2)
    expect(toLeft.levels[0]).toMatchObject({ route: "branch", structureId: "pick", armIndex: 0 })
    expect(toLeft.levels[1]).toMatchObject({ route: "parallel", structureId: "both", armIndex: 0 })
    expectFlatMatchesLevel0(toLeft)
    const toRight = routeBetween(doc, EXECUTION_ACCEPTS_NODE_ID, "right")
    expect(toRight.levels[1]).toMatchObject({ armIndex: 1 })
  })

  it("parallel line into branch composes parallel then branch levels", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "lanes",
          branches: [
            [
              {
                type: "branch",
                id: "inner",
                branches: [
                  {
                    expr: "(state) => true",
                    steps: [{ id: "yes", uses: "@executioncontrolprotocol/test.echo", input: { value: "y" } }],
                  },
                  { steps: [{ id: "no", uses: "@executioncontrolprotocol/test.echo", input: { value: "n" } }] },
                ],
              },
            ],
            [{ id: "plain", uses: "@executioncontrolprotocol/test.echo", input: { value: "p" } }],
          ],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const toYes = routeBetween(doc, EXECUTION_ACCEPTS_NODE_ID, "yes")
    expect(toYes.levels).toHaveLength(2)
    expect(toYes.levels[0]).toMatchObject({ route: "parallel", structureId: "lanes", armIndex: 0 })
    expect(toYes.levels[1]).toMatchObject({ route: "branch", structureId: "inner", armIndex: 0 })
    expectFlatMatchesLevel0(toYes)
  })

  it.each(["branch.ecp.json", "loop.ecp.json"])("%s route edges expose levels[0] equal to flat fields", (name) => {
    const doc = executionToReactFlow(load(name))
    for (const edge of routeEdges(doc)) {
      if (edge.data.loopBack) continue
      expect(edge.data.levels.length).toBeGreaterThanOrEqual(1)
      expectFlatMatchesLevel0(edge.data)
    }
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
    expect((frames[0]!.data as ReactFlowFrameData).structureKind).toBe("parallel")
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

  it("emits frames for branch, while, for, and forEach loops", () => {
    const branchDoc = executionToReactFlow(load("branch.ecp.json"))
    const branchFrame = frameNodes(branchDoc)[0]!
    expect((branchFrame.data as ReactFlowFrameData).structureKind).toBe("branch")
    expect((branchFrame.data as ReactFlowFrameData).label).toBe("branch")

    const whileDoc = executionToReactFlow(load("loop.ecp.json"))
    const whileFrame = frameNodes(whileDoc)[0]!
    expect((whileFrame.data as ReactFlowFrameData).structureKind).toBe("loop")
    expect((whileFrame.data as ReactFlowFrameData).loopMode).toBe("while")
    expect(encloses(whileFrame, stepNode(whileDoc, "tick"))).toBe(true)
    expect(encloses(whileFrame, whileDoc.nodes.find((n) => n.id === "refine")!)).toBe(true)

    const forDoc = executionToReactFlow(load("loop-for.ecp.json"))
    const forFrame = frameNodes(forDoc)[0]!
    expect((forFrame.data as ReactFlowFrameData).label).toBe("for N")

    const feDoc = executionToReactFlow(load("loop-foreach.ecp.json"))
    const feFrame = frameNodes(feDoc)[0]!
    expect((feFrame.data as ReactFlowFrameData).label).toMatch(/^forEach/)
    expect(encloses(feFrame, stepNode(feDoc, "rows"))).toBe(true)
  })

  it("nested parallel, loop and branch produce nested frames", () => {
    const doc = executionToReactFlow(load("nested.ecp.json"))
    const frames = frameNodes(doc)
    expect(frames).toHaveLength(3)
    const outer = frames.find((f) => (f.data as ReactFlowFrameData).structureId === "outer")!
    const inner = frames.find((f) => (f.data as ReactFlowFrameData).structureId === "inner")!
    const arm = frames.find((f) => (f.data as ReactFlowFrameData).structureId === "arm")!
    expect(encloses(outer, stepNode(doc, "side"))).toBe(true)
    expect(encloses(inner, stepNode(doc, "inner"))).toBe(true)
    expect(encloses(arm, stepNode(doc, "nested"))).toBe(true)
    expect(outer.position.y).toBeLessThan(inner.position.y)
    expect(inner.position.y).toBeLessThan(arm.position.y)
    expect((outer.zIndex ?? 0)).toBeLessThan(inner.zIndex ?? 0)
    expect((inner.zIndex ?? 0)).toBeLessThan(arm.zIndex ?? 0)
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

describe("detached layout", () => {
  const invalidDir = path.resolve(here, "../../../../fixtures/manifests/invalid")

  it("stamps detached steps and places them below the main flow", () => {
    const manifest = JSON.parse(readFileSync(path.join(invalidDir, "detached.ecp.json"), "utf8")) as ExecutionManifest
    const doc = executionToReactFlow(manifest)
    const aside = doc.nodes.find((node) => node.id === "aside")
    expect(aside?.type).toBe("ecp-step")
    expect((aside?.data as ReactFlowStepData).detached).toBe(true)
    for (const edge of doc.edges) {
      expect(edge.source).not.toBe("aside")
      expect(edge.target).not.toBe("aside")
    }
    const mainNodes = doc.nodes.filter((node) => node.id !== "aside" && !(node.data as { detached?: boolean }).detached)
    const mainMaxY = mainNodes.reduce((max, node) => Math.max(max, node.position.y), -Infinity)
    const detachedMinY = aside ? aside.position.y : Infinity
    expect(detachedMinY).toBeGreaterThan(mainMaxY)
  })

  it("detached branch frame is stamped and has no incident route edges", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "keep", uses: "@executioncontrolprotocol/test.echo", input: { value: "k" }, as: "keep" }],
      detached: [
        {
          type: "branch",
          id: "asideBranch",
          branches: [{ expr: "(state) => true", steps: [{ id: "aside", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "aside" }] }],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const frame = doc.nodes.find((node) => node.type === "ecp-frame" && (node.data as ReactFlowFrameData).structureId === "asideBranch")
    expect((frame?.data as ReactFlowFrameData).detached).toBe(true)
    const memberIds = new Set(["asideBranch", "aside"])
    for (const edge of doc.edges) {
      if (edge.data.kind === "route") {
        expect(memberIds.has(edge.source) && memberIds.has(edge.target)).toBe(false)
      }
    }
  })

  it("data edges carry bindingPath and paramKey for script params", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "w", uses: "@executioncontrolprotocol/test.echo", input: { value: "w" }, as: "w" },
        {
          id: "r",
          uses: "@executioncontrolprotocol/test.echo",
          input: {
            code: { $script: { lang: "js", source: "1", params: { p: { $ref: "state.w" } } } },
          },
          as: "r",
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const edge = doc.edges.find((entry) => entry.data.kind === "data" && entry.target === "r")
    expect(edge?.data).toMatchObject({ bindingPath: "code", paramKey: "p" })
  })
})
