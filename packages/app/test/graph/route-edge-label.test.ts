import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ReactFlowRouteLevel } from "../../src/graph/types.js"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { executionToReactFlow } from "../../src/graph/execution-to-reactflow.js"
import { routeDeleteMenuLabel, routeDeleteTarget, routeEdgeLabel } from "../../src/graph/route-edge-label.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../../../../")
const validDir = path.join(repoRoot, "fixtures/manifests/valid")
const examplesDir = path.join(repoRoot, "examples/branch-loop")

function loadValid(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(validDir, name), "utf8")) as ExecutionManifest
}

function loadExample(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(examplesDir, name), "utf8")) as ExecutionManifest
}

function routeEdge(manifest: ExecutionManifest, target: string) {
  const doc = executionToReactFlow(manifest)
  const edge = doc.edges.find((entry) => entry.data.kind === "route" && entry.target === target)
  expect(edge?.data.kind).toBe("route")
  return edge!
}

describe("routeEdgeLabel", () => {
  it("joins nested branch labels and skips non-branch levels", () => {
    const toX = routeEdge(loadValid("nested-branch.ecp.json"), "x")
    expect(routeEdgeLabel(toX.data.levels)).toBe("outer \u203a inner")

    const toW = routeEdge(loadValid("nested-branch.ecp.json"), "w")
    expect(routeEdgeLabel(toW.data.levels)).toBe("outer")

    const toN = routeEdge(loadValid("nested-branch.ecp.json"), "n")
    expect(routeEdgeLabel(toN.data.levels)).toBe("")

    const loopOnly: readonly ReactFlowRouteLevel[] = [{ route: "loop", structureId: "l", maxRounds: 3 }]
    expect(routeEdgeLabel(loopOnly)).toBe("")

    const parallelOnly: readonly ReactFlowRouteLevel[] = [
      { route: "parallel", structureId: "p", armIndex: 0 },
    ]
    expect(routeEdgeLabel(parallelOnly)).toBe("")

    const sequenceOnly: readonly ReactFlowRouteLevel[] = [{ route: "sequence" }]
    expect(routeEdgeLabel(sequenceOnly)).toBe("")
  })

  it("shows a single labeled arm and omits default arms without labels", () => {
    const expand = routeEdge(loadExample("branch-loop.ecp.json"), "expanded")
    expect(routeEdgeLabel(expand.data.levels)).toBe("expand")

    const withDefault: readonly ReactFlowRouteLevel[] = [
      { route: "branch", structureId: "b", armIndex: 1, defaultArm: true },
    ]
    expect(routeEdgeLabel(withDefault)).toBe("")

    const mixed: readonly ReactFlowRouteLevel[] = [
      { route: "branch", structureId: "outer", armIndex: 0, label: "outer" },
      { route: "branch", structureId: "inner", armIndex: 1 },
      { route: "parallel", structureId: "p", armIndex: 0 },
    ]
    expect(routeEdgeLabel(mixed)).toBe("outer")
  })
})

describe("routeDeleteTarget", () => {
  it("targets the innermost branch arm when branch levels are present", () => {
    const toX = routeEdge(loadValid("nested-branch.ecp.json"), "x")
    expect(routeDeleteTarget(toX.data.levels)).toBe(1)
    expect(routeDeleteMenuLabel(toX.data.levels, routeDeleteTarget(toX.data.levels)!)).toBe("Delete branch inner")

    const toW = routeEdge(loadValid("nested-branch.ecp.json"), "w")
    expect(routeDeleteTarget(toW.data.levels)).toBe(1)
    expect(routeDeleteMenuLabel(toW.data.levels, routeDeleteTarget(toW.data.levels)!)).toBe("Delete branch")

    const expand = routeEdge(loadExample("branch-loop.ecp.json"), "expanded")
    expect(routeDeleteTarget(expand.data.levels)).toBe(0)
  })

  it("falls back to parallel or sequence when no branch arm is present", () => {
    const loopOnly: readonly ReactFlowRouteLevel[] = [{ route: "loop", structureId: "l" }]
    expect(routeDeleteTarget(loopOnly)).toBeUndefined()

    const parallelOnly: readonly ReactFlowRouteLevel[] = [
      { route: "parallel", structureId: "p", armIndex: 1 },
    ]
    expect(routeDeleteTarget(parallelOnly)).toBe(0)

    const branchThenParallel: readonly ReactFlowRouteLevel[] = [
      { route: "branch", structureId: "b", armIndex: 0, label: "go" },
      { route: "parallel", structureId: "p", armIndex: 0 },
    ]
    expect(routeDeleteTarget(branchThenParallel)).toBe(0)

    const sequenceOnly: readonly ReactFlowRouteLevel[] = [{ route: "sequence" }]
    expect(routeDeleteTarget(sequenceOnly)).toBe(0)
    expect(routeDeleteMenuLabel(sequenceOnly, 0)).toBe("Delete")
    expect(routeDeleteMenuLabel(sequenceOnly, 99)).toBe("Delete")
  })
})