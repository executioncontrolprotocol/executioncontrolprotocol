import { describe, expect, it } from "vitest"
import { branch, expr, loop, step, workflow } from "@executioncontrolprotocol/core"
import type { ReactFlowRouteEdgeData } from "../src/graph/index.js"
import {
  edgeMenuActions,
  parseExprBadge,
  renderConfiguredRouteSource,
} from "../src/ui/lib/route-configure.js"

describe("edgeMenuActions", () => {
  it("offers configure for routes and disconnect for data", () => {
    expect(edgeMenuActions("route")).toEqual(["configure"])
    expect(edgeMenuActions("data")).toEqual(["disconnect"])
    expect(edgeMenuActions("control")).toEqual([])
    expect(edgeMenuActions(undefined)).toEqual([])
  })
})

describe("parseExprBadge", () => {
  it("parses eq and neq badges", () => {
    expect(parseExprBadge('eq("flag", true)')).toEqual({ eq: ["flag", true] })
    expect(parseExprBadge('neq(expand, false)')).toEqual({ neq: ["expand", false] })
  })

  it("rejects invalid badges", () => {
    expect(() => parseExprBadge("flag == true")).toThrow(/Expected eq/)
    expect(() => parseExprBadge("eq(flag, not-json)")).toThrow(/valid JSON/)
  })
})

describe("renderConfiguredRouteSource", () => {
  it("rewrites a branch arm when expression", () => {
    const manifest = workflow("Arms")
      .run([
        branch([
          step("@executioncontrolprotocol/test.echo", "Yes")
            .with({ value: "y" })
            .when(expr.eq("flag", true))
            .as("yes"),
          step("@executioncontrolprotocol/test.echo", "No")
            .with({ value: "n" })
            .when(expr.eq("flag", false))
            .as("no"),
        ]),
      ])
      .toManifest()
    const branchNode = manifest.steps.find((node) => node.type === "branch")
    expect(branchNode?.type).toBe("branch")
    const route: ReactFlowRouteEdgeData = {
      kind: "route",
      route: "branch",
      structureId: branchNode!.id,
      armIndex: 0,
      whenBadge: 'eq("flag", true)',
    }
    const source = renderConfiguredRouteSource(manifest, route, {
      whenText: 'eq("flag", false)',
    })
    expect(source).toContain('eq("flag", false)')
  })

  it("rewrites loop until and maxRounds", () => {
    const manifest = workflow("Loop")
      .run([
        loop({ until: expr.eq("done", true), maxRounds: 3 }, [
          step("@executioncontrolprotocol/test.echo", "Tick").with({ value: "1" }).as("tick"),
        ]),
      ])
      .toManifest()
    const loopNode = manifest.steps.find((node) => node.type === "loop")
    expect(loopNode?.type).toBe("loop")
    const route: ReactFlowRouteEdgeData = {
      kind: "route",
      route: "loop",
      structureId: loopNode!.id,
      untilBadge: 'eq("done", true)',
      maxRounds: 3,
      loopBack: true,
    }
    const source = renderConfiguredRouteSource(manifest, route, {
      untilText: 'eq("done", false)',
      maxRounds: 5,
    })
    expect(source).toContain('eq("done", false)')
    expect(source).toContain("5")
  })
})
