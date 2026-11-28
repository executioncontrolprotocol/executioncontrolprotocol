import { describe, expect, it } from "vitest"
import { applyPatch } from "../src/operations/patch.js"

const manifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  steps: [
    { id: "doc", uses: "echo", input: { value: "doc" }, as: "doc" },
    {
      type: "if",
      id: "check-headline",
      expression: "true",
      then: [{ id: "translate", uses: "echo", input: { prompt: "hi" }, as: "translated" }],
      else: [{ id: "skip", uses: "echo", input: { value: "skip" }, as: "skip" }],
    },
    { id: "banner", uses: "echo", input: { value: "banner" }, as: "banner" },
  ],
}

describe("applyPatch", () => {
  it("applies add, remove, replace, move, copy and test", () => {
    const added = applyPatch(manifest, [
      { op: "add", path: "/steps/-", value: { id: "tail", uses: "echo", input: { value: "tail" } } },
    ])
    expect(added.steps).toHaveLength(4)
    expect(added.steps[3]).toMatchObject({ id: "tail" })

    const removed = applyPatch(added, [{ op: "remove", path: "/steps/3" }])
    expect(removed.steps).toHaveLength(3)

    const replaced = applyPatch(manifest, [{ op: "replace", path: "/steps/0/input/value", value: "replaced" }])
    expect(replaced.steps[0]).toMatchObject({ input: { value: "replaced" } })

    const moved = applyPatch(manifest, [{ op: "move", path: "/steps/2", from: "/steps/0" }])
    expect(moved.steps.map((step) => (step as { id: string }).id)).toEqual(["check-headline", "banner", "doc"])

    const copied = applyPatch(manifest, [{ op: "copy", path: "/steps/0/as", from: "/steps/2/as" }])
    expect(copied.steps[0]).toMatchObject({ as: "banner" })

    expect(() => applyPatch(manifest, [{ op: "test", path: "/steps/0/id", value: "doc" }])).not.toThrow()
  })

  it("resolves @nodeId under a nested if and rejects unknown ids and failed tests", () => {
    const patched = applyPatch(manifest, [
      { op: "replace", path: "/steps/@translate/input/prompt", value: "Translate politely" },
      {
        op: "add",
        path: "/steps/@check-headline/else/-",
        value: { id: "log", uses: "echo", input: { value: "log" } },
      },
    ])
    const ifNode = patched.steps[1] as {
      then: Array<{ id: string; input?: { prompt?: string } }>
      else: Array<{ id: string }>
    }
    expect(ifNode.then[0]?.input?.prompt).toBe("Translate politely")
    expect(ifNode.else.map((step) => step.id)).toEqual(["skip", "log"])

    expect(() => applyPatch(manifest, [{ op: "replace", path: "/steps/@missing/input", value: 1 }])).toThrow(
      expect.objectContaining({ code: "ECP_PATCH_INVALID", message: expect.stringContaining("op 0") }),
    )
    expect(() => applyPatch(manifest, [{ op: "test", path: "/steps/@doc/id", value: "other" }])).toThrow(
      expect.objectContaining({ code: "ECP_PATCH_INVALID" }),
    )
  })

  it("handles array inserts, missing paths and root replace", () => {
    const withInsert = applyPatch(manifest, [{ op: "add", path: "/steps/1", value: { id: "mid", uses: "echo" } }])
    expect(withInsert.steps.map((step) => (step as { id: string }).id)).toEqual([
      "doc",
      "mid",
      "check-headline",
      "banner",
    ])
    expect(() => applyPatch(manifest, [{ op: "remove", path: "/steps/9" }])).toThrow(
      expect.objectContaining({ code: "ECP_PATCH_INVALID" }),
    )
    expect(() => applyPatch(manifest, [{ op: "remove", path: "/steps/0/missing" }])).toThrow(
      expect.objectContaining({ code: "ECP_PATCH_INVALID" }),
    )
    const replaced = applyPatch(manifest, [{ op: "replace", path: "", value: { ok: true } }])
    expect(replaced).toEqual({ ok: true })
    expect(() => applyPatch(manifest, [{ op: "add", path: "steps/0", value: 1 } as never])).toThrow(
      expect.objectContaining({ code: "ECP_PATCH_INVALID" }),
    )
    const copied = applyPatch(manifest, [{ op: "copy", path: "/steps/-", from: "/steps/0" }])
    expect(copied.steps).toHaveLength(4)
    expect(() => applyPatch(manifest, [{ op: "remove", path: "" }])).toThrow(
      expect.objectContaining({ code: "ECP_PATCH_INVALID" }),
    )
    expect(() => applyPatch(manifest, [{ op: "add", path: "/steps/0/input/value/child", value: 1 }])).toThrow(
      expect.objectContaining({ code: "ECP_PATCH_INVALID" }),
    )
    expect(() => applyPatch(manifest, [{ op: "replace", path: "/steps/0/id", value: "x" }, { op: "test", path: "/steps/0/id", value: "doc" }])).toThrow(
      expect.objectContaining({ code: "ECP_PATCH_INVALID", message: expect.stringContaining("op 1") }),
    )
    const parallel = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [[{ id: "left", uses: "echo" }], [{ id: "right", uses: "echo" }]],
        },
      ],
    }
    const nested = applyPatch(parallel, [{ op: "replace", path: "/steps/@right/uses", value: "fail" }])
    expect((nested.steps[0] as { paths: Array<Array<{ uses: string }>> }).paths[1]?.[0]?.uses).toBe("fail")
  })
})
