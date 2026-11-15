import { describe, expect, it } from "vitest"
import {
  branch,
  expr,
  loop,
  parallel,
  step,
  workflow,
} from "@executioncontrolprotocol/core"
import type { ReactFlowRouteEdgeData } from "../src/graph/index.js"
import {
  edgeMenuActions,
  flattenRouteStructure,
  parseExprBadge,
  renderConfiguredRouteSource,
  renderUnwrappedRouteSource,
  renderWrappedStepSource,
} from "../src/ui/lib/route-configure.js"

describe("edgeMenuActions", () => {
  it("offers configure and disconnect for data and route edges", () => {
    expect(edgeMenuActions("route")).toEqual(["configure", "disconnect"])
    expect(edgeMenuActions("data")).toEqual(["configure", "disconnect"])
    expect(edgeMenuActions("control")).toEqual([])
    expect(edgeMenuActions(undefined)).toEqual([])
  })
})

describe("parseExprBadge", () => {
  it("parses function source into $fn documents", () => {
    expect(parseExprBadge("(state) => state.flag === true")).toEqual({
      $fn: true,
      source: "(state) => state.flag === true",
      params: ["state"],
    })
    expect(parseExprBadge("(state) => state.expand !== false")).toEqual({
      $fn: true,
      source: "(state) => state.expand !== false",
      params: ["state"],
    })
  })

  it("rejects invalid sources", () => {
    expect(() => parseExprBadge("flag == true")).toThrow(/Invalid expression source/)
    expect(() => parseExprBadge("")).toThrow(/must not be empty/)
    expect(() => parseExprBadge("function () { [native code] }")).toThrow(/native/)
  })
})

describe("renderConfiguredRouteSource", () => {
  it("rewrites a branch arm when expression", () => {
    const manifest = workflow("Arms")
      .run([
        branch([
          step("@executioncontrolprotocol/test.echo", "Yes")
            .with({ value: "y" })
            .when(expr((state) => state.flag === true))
            .as("yes"),
          step("@executioncontrolprotocol/test.echo", "No")
            .with({ value: "n" })
            .when(expr((state) => state.flag === false))
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
      whenBadge: "(state) => state.flag === true",
    }
    const source = renderConfiguredRouteSource(manifest, route, {
      whenText: "(state) => state.flag === false",
    })
    expect(source).toContain("state.flag === false")
  })

  it("rewrites loop until and maxRounds", () => {
    const manifest = workflow("Loop")
      .run([
        loop({ until: expr((state) => state.done === true), maxRounds: 3 }, [
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
      untilBadge: "(state) => state.done === true",
      maxRounds: 3,
      loopBack: true,
    }
    const source = renderConfiguredRouteSource(manifest, route, {
      untilText: "(state) => state.done === false",
      maxRounds: 5,
    })
    expect(source).toContain("state.done === false")
    expect(source).toContain("5")
  })
})

describe("unwrapRouteStructure", () => {
  it("unwraps a loop into sequential body steps", () => {
    const manifest = workflow("Loop")
      .run([
        step("@executioncontrolprotocol/test.echo", "Before").with({ value: "b" }).as("before"),
        loop({ until: expr((state) => state.done === true), label: "retry" }, [
          step("@executioncontrolprotocol/test.echo", "Tick").with({ value: "1" }).as("tick"),
        ]),
        step("@executioncontrolprotocol/test.echo", "After").with({ value: "a" }).as("after"),
      ])
      .toManifest()
    const loopNode = manifest.steps.find((node) => node.type === "loop")
    expect(loopNode?.type).toBe("loop")
    const source = renderUnwrappedRouteSource(manifest, loopNode!.id)
    expect(source).not.toContain("loop(")
    expect(source).toContain('.as("tick")')
    expect(source).toContain('.as("before")')
    expect(source).toContain('.as("after")')
  })

  it("unwraps a branch into sequential arms and preserves when", () => {
    const manifest = workflow("Arms")
      .run([
        branch([
          step("@executioncontrolprotocol/test.echo", "Yes")
            .with({ value: "y" })
            .when(expr((state) => state.flag === true))
            .as("yes"),
          step("@executioncontrolprotocol/test.echo", "No")
            .with({ value: "n" })
            .when(expr((state) => state.flag === false))
            .as("no"),
        ]),
      ])
      .toManifest()
    const branchNode = manifest.steps.find((node) => node.type === "branch")
    expect(branchNode?.type).toBe("branch")
    const source = renderUnwrappedRouteSource(manifest, branchNode!.id)
    expect(source).not.toContain("branch(")
    expect(source).toContain('.as("yes")')
    expect(source).toContain('.as("no")')
    expect(source).toContain("state.flag === true")
  })

  it("copies arm when onto a bare first step when unwrapping", () => {
    const when = { $fn: true as const, source: "(state) => state.flag === true", params: ["state"] }
    const manifest = workflow("Bare")
      .run([
        {
          type: "branch" as const,
          id: "branch-bare",
          branches: [
            {
              when,
              steps: [
                {
                  id: "yes",
                  uses: "@executioncontrolprotocol/test.echo",
                  label: "Yes",
                  input: { value: "y" },
                  as: "yes",
                },
              ],
            },
          ],
        },
      ])
      .toManifest()
    const flat = flattenRouteStructure(manifest.steps[0]!)
    expect(flat).toHaveLength(1)
    expect(flat[0]).toMatchObject({
      id: "yes",
      when,
    })
  })

  it("unwraps parallel lanes in order", () => {
    const manifest = workflow("Fan")
      .run([
        parallel([
          [step("@executioncontrolprotocol/test.echo", "A").with({ value: "a" }).as("a")],
          [step("@executioncontrolprotocol/test.echo", "B").with({ value: "b" }).as("b")],
        ]),
      ])
      .toManifest()
    const parallelNode = manifest.steps.find((node) => node.type === "parallel")
    expect(parallelNode?.type).toBe("parallel")
    const source = renderUnwrappedRouteSource(manifest, parallelNode!.id)
    expect(source).not.toContain("parallel(")
    expect(source).toContain('.as("a")')
    expect(source).toContain('.as("b")')
  })
})

describe("wrapStepInRoute", () => {
  it("wraps a step in a loop with until and maxRounds", () => {
    const manifest = workflow("Plain")
      .run([
        step("@executioncontrolprotocol/test.echo", "Tick").with({ value: "1" }).as("tick"),
      ])
      .toManifest()
    const source = renderWrappedStepSource(manifest, "tick", {
      routeKind: "loop",
      untilText: "(state) => state.done === true",
      maxRounds: 2,
    })
    expect(source).toContain("loop(")
    expect(source).toContain("state.done === true")
    expect(source).toContain("2")
    expect(source).toContain('.as("tick")')
  })

  it("wraps a step in a branch with when", () => {
    const manifest = workflow("Plain")
      .run([
        step("@executioncontrolprotocol/test.echo", "Yes").with({ value: "y" }).as("yes"),
      ])
      .toManifest()
    const source = renderWrappedStepSource(manifest, "yes", {
      routeKind: "branch",
      whenText: "(state) => state.flag === true",
    })
    expect(source).toContain("branch(")
    expect(source).toContain("state.flag === true")
    expect(source).toContain('.as("yes")')
  })

  it("wraps a step in a single parallel lane", () => {
    const manifest = workflow("Plain")
      .run([
        step("@executioncontrolprotocol/test.echo", "A").with({ value: "a" }).as("a"),
      ])
      .toManifest()
    const source = renderWrappedStepSource(manifest, "a", { routeKind: "parallel" })
    expect(source).toContain("parallel(")
    expect(source).toContain('.as("a")')
  })

  it("rejects branch wrap without when", () => {
    const manifest = workflow("Plain")
      .run([
        step("@executioncontrolprotocol/test.echo", "Yes").with({ value: "y" }).as("yes"),
      ])
      .toManifest()
    expect(() =>
      renderWrappedStepSource(manifest, "yes", { routeKind: "branch" })
    ).toThrow(/when/)
  })
})
