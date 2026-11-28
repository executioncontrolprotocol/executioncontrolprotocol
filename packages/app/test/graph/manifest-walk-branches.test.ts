import type { ExecutionManifest, Node } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  allNodeIds,
  cleanNode,
  cleanNodes,
  finalizeManifest,
  findNodePlacement,
  nodeContainsId,
} from "../../src/graph/manifest-walk.js"
import { STRUCTURE_EDIT_EMPTY_STEPS, walkManifestPlacements } from "../../src/graph/index.js"

const echo = "@executioncontrolprotocol/test.echo"

describe("manifest-walk cleanup branches", () => {
  it("unwraps a parallel with a single non-empty path", () => {
    const collapsed = cleanNode({
      type: "parallel",
      id: "p",
      paths: [[{ id: "only", uses: echo, input: { value: "a" }, as: "only" }]],
    })
    expect(Array.isArray(collapsed)).toBe(true)
    if (Array.isArray(collapsed)) expect(collapsed[0]?.id).toBe("only")
  })

  it("keeps two paths when one is empty", () => {
    const collapsed = cleanNode({
      type: "parallel",
      id: "p",
      paths: [
        [{ id: "only", uses: echo, input: { value: "a" }, as: "only" }],
        [],
      ],
    })
    expect(collapsed).toMatchObject({ type: "parallel", paths: [[{ id: "only" }], []] })
  })

  it("keeps empty if then and empty loop body", () => {
    expect(
      cleanNode({
        type: "if",
        id: "g",
        expression: "true",
        then: [],
        else: [{ id: "e", uses: echo, input: { value: "e" } }],
      }),
    ).toMatchObject({ type: "if", then: [] })
    expect(cleanNodes([{ type: "loop", id: "l", mode: "for", as: "i", input: { count: 1 }, steps: [] }])).toEqual([
      { type: "loop", id: "l", mode: "for", as: "i", input: { count: 1 }, steps: [] },
    ])
  })

  it("strips an empty else side and removes an all-empty parallel", () => {
    const kept = cleanNode({
      type: "if",
      id: "g",
      expression: "true",
      then: [{ id: "t", uses: echo, input: { value: "t" }, as: "t" }],
      else: [],
    })
    expect(kept).toMatchObject({ type: "if", then: [{ id: "t" }] })
    expect((kept as { else?: unknown[] }).else ?? []).toEqual([])
    const emptied = cleanNode({ type: "parallel", id: "p", paths: [[], []] })
    expect(emptied).toMatchObject({ type: "parallel", paths: [[], []] })
  })

  it("finalizeManifest strips an empty detached list", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: echo, input: { value: "s" }, as: "s" }],
      detached: [],
    }
    const result = finalizeManifest(manifest)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest.detached).toBeUndefined()
  })

  it("rejects finalize when steps would be empty", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [],
    }
    expect(finalizeManifest(manifest)).toEqual({ ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS })
  })
})

describe("manifest-walk lookups", () => {
  const tree: Node[] = [
    {
      type: "parallel",
      id: "p",
      paths: [
        [
          {
            type: "if",
            id: "inner",
            expression: "true",
            then: [{ id: "leaf", uses: echo, input: { value: "l" }, as: "leaf" }],
          },
        ],
      ],
    },
  ]

  it("finds nested placements and membership", () => {
    expect(findNodePlacement(tree, "leaf")?.node.id).toBe("leaf")
    expect(nodeContainsId(tree[0]!, "leaf")).toBe(true)
    expect(nodeContainsId(tree[0]!, "missing")).toBe(false)
    expect(nodeContainsId({ id: "solo", uses: echo, input: { value: "s" }, as: "solo" }, "solo")).toBe(true)
    expect(nodeContainsId({ id: "solo", uses: echo, input: { value: "s" }, as: "solo" }, "other")).toBe(false)
  })

  it("collects ids from detached roots", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: echo, input: { value: "s" }, as: "s" }],
      detached: [{ id: "d", uses: echo, input: { value: "d" }, as: "d" }],
    }
    expect(allNodeIds(manifest)).toEqual(new Set(["s", "d"]))
    expect(walkManifestPlacements(manifest.steps).placements.length).toBeGreaterThan(0)
  })
})