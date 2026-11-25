import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { exprIssuesAtPointer } from "../../src/graph/edge-manifest.js"
import {
  applyDataEdgeDraft,
  applyRouteEdgeDraft,
  dataEdgeEditable,
  routeEdgeEditable,
} from "../../src/graph/edge-panel-logic.js"

describe("applyDataEdgeDraft", () => {
  it("updates a step expr gate", () => {
    const gated: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "gated", uses: "@executioncontrolprotocol/test.echo", expr: "true", input: {} }],
    }
    const next = applyDataEdgeDraft(gated, "gated", { kind: "data", inputPath: "expr", statePath: "x" }, "(state) => false")
    expect(next?.steps?.[0]).toMatchObject({ expr: "(state) => false" })
  })

  it("does not write a ref-only binding", () => {
    const refManifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "step", uses: "@executioncontrolprotocol/test.echo", input: { value: { $ref: "state.x" } } }],
    }
    expect(applyDataEdgeDraft(refManifest, "step", { kind: "data", inputPath: "value", statePath: "x" }, "nope")).toBeUndefined()
  })
})

describe("dataEdgeEditable", () => {
  it("allows step expr gates only", () => {
    expect(dataEdgeEditable({ manifestPointer: "/x", validatePointer: "/x/$expr", markerKind: "expr" })).toBe(false)
    expect(dataEdgeEditable({ manifestPointer: "/x", validatePointer: "/x", markerKind: "ref", refPath: "state.x" })).toBe(false)
    expect(dataEdgeEditable({ manifestPointer: "/x", validatePointer: "/x", markerKind: "expr-gate" })).toBe(true)
  })
})

describe("applyRouteEdgeDraft", () => {
  const branchManifest: ExecutionManifest = {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      {
        type: "branch",
        id: "pick",
        branches: [{ expr: "state.on", steps: [{ id: "a", uses: "@executioncontrolprotocol/test.echo" }] }],
      },
    ],
  }

  it("updates branch arm expr", () => {
    const next = applyRouteEdgeDraft(
      branchManifest,
      { kind: "route", route: "branch", structureId: "pick", armIndex: 0 },
      "state.off",
    )
    const arm = (next?.steps?.[0] as { branches?: Array<{ expr?: string }> })?.branches?.[0]
    expect(arm?.expr).toBe("state.off")
  })

  it("refuses default arms", () => {
    expect(
      applyRouteEdgeDraft(
        branchManifest,
        { kind: "route", route: "branch", structureId: "pick", armIndex: 1, defaultArm: true },
        "nope",
      ),
    ).toBeUndefined()
  })
})

describe("routeEdgeEditable", () => {
  it("allows non-default arms with a manifest pointer", () => {
    expect(
      routeEdgeEditable({
        manifestPointer: "/steps/0/branches/0/expr",
        validatePointer: "/steps/0/branches/0/expr",
        exprSource: "true",
      }),
    ).toBe(true)
    expect(routeEdgeEditable({ manifestPointer: "", validatePointer: "", defaultArm: true })).toBe(false)
  })
})

describe("exprIssuesAtPointer", () => {
  it("keeps issues on the edited pointer only", () => {
    const issues = exprIssuesAtPointer(
      [
        { code: "ECP_EXPR_INVALID", severity: "error", message: "bad", path: "/steps/0/input/value/$expr", line: 1, column: 2 },
        { code: "ECP_EXPR_INVALID", severity: "error", message: "other", path: "/steps/1/expr", line: 1, column: 1 },
      ],
      "/steps/0/input/value/$expr",
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.line).toBe(1)
  })
})