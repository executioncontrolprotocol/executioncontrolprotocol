import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  dataEdgeInspectorMeta,
  inputManifestPointer,
  readManifestPointer,
  replaceManifestPointer,
  routeEdgeInspectorMeta,
  valueAtInputPath,
  valueAtStateRef,
} from "../../src/graph/edge-manifest.js"

const manifest: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  steps: [
    {
      id: "reader",
      uses: "@executioncontrolprotocol/test.echo",
      input: {
        flat: { $ref: "state.seed", optional: true, fallback: "x" },
        nested: {
          $expr: "(state) => state.doc.title",
        },
      },
      as: "out",
    },
    {
      type: "branch",
      id: "pick",
      branches: [
        { label: "yes", expr: "state.flag === true", steps: [{ id: "a", uses: "@executioncontrolprotocol/test.echo" }] },
        { label: "default", steps: [{ id: "b", uses: "@executioncontrolprotocol/test.echo" }] },
      ],
    },
    {
      type: "loop",
      id: "loop",
      expr: "state.on === true",
      maxRounds: 3,
      steps: [{ id: "c", uses: "@executioncontrolprotocol/test.echo" }],
    },
  ],
}

describe("dataEdgeInspectorMeta", () => {
  it("reads optional ref with fallback", () => {
    const meta = dataEdgeInspectorMeta(manifest, "reader", "flat")
    expect(meta?.markerKind).toBe("ref")
    expect(meta?.optional).toBe(true)
    expect(meta?.fallback).toBe("x")
    expect(meta?.refPath).toBe("state.seed")
  })

  it("reads $expr on a nested input path", () => {
    const meta = dataEdgeInspectorMeta(manifest, "reader", "nested")
    expect(meta?.markerKind).toBe("expr")
    expect(meta?.validatePointer).toMatch(/\/\$expr$/)
    expect(meta?.exprSource).toContain("state.doc.title")
  })

  it("returns undefined for a missing input path", () => {
    expect(dataEdgeInspectorMeta(manifest, "reader", "missing")).toBeUndefined()
  })

  it("returns undefined when the input value is not a ref or expr", () => {
    const plain: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "plain", uses: "@executioncontrolprotocol/test.echo", input: { value: "hello" } }],
    }
    expect(dataEdgeInspectorMeta(plain, "plain", "value")).toBeUndefined()
  })

  it("reads step expr-gate handle", () => {
    const gated: ExecutionManifest = {
      ...manifest,
      steps: [{ id: "gated", uses: "@executioncontrolprotocol/test.echo", expr: "(state) => state.on", input: {} }],
    }
    const meta = dataEdgeInspectorMeta(gated, "gated", "expr")
    expect(meta?.markerKind).toBe("expr-gate")
    expect(meta?.exprSource).toContain("state.on")
  })

  it("finds steps nested under parallel lines", () => {
    const parallel: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          branches: [
            [{ id: "inner", uses: "@executioncontrolprotocol/test.echo", input: { value: { $ref: "state.x" } } }],
          ],
        },
      ],
    }
    expect(dataEdgeInspectorMeta(parallel, "inner", "value")?.markerKind).toBe("ref")
  })
})

describe("routeEdgeInspectorMeta", () => {
  it("reads branch arm expr", () => {
    const meta = routeEdgeInspectorMeta(manifest, {
      kind: "route",
      route: "branch",
      structureId: "pick",
      armIndex: 0,
      exprSource: "state.flag === true",
    })
    expect(meta?.exprSource).toBe("state.flag === true")
    expect(meta?.manifestPointer).toContain("/branches/0/expr")
  })

  it("marks the default arm read-only", () => {
    const meta = routeEdgeInspectorMeta(manifest, {
      kind: "route",
      route: "branch",
      structureId: "pick",
      armIndex: 1,
      defaultArm: true,
    })
    expect(meta?.defaultArm).toBe(true)
  })

  it("reads loop expr", () => {
    const meta = routeEdgeInspectorMeta(manifest, {
      kind: "route",
      route: "loop",
      structureId: "loop",
      exprSource: "state.on === true",
    })
    expect(meta?.exprSource).toBe("state.on === true")
  })

  it("returns undefined for unsupported route kinds", () => {
    expect(
      routeEdgeInspectorMeta(manifest, { kind: "route", route: "parallel", structureId: "prepare" }),
    ).toBeUndefined()
  })
})

describe("replaceManifestPointer", () => {
  it("replaces an $expr body", () => {
    const pointer = inputManifestPointer(manifest, "reader", "nested")
    expect(pointer).toBeDefined()
    const next = replaceManifestPointer(manifest, pointer!, { $expr: "(state) => 1" })
    const value = readManifestPointer(next, pointer!)
    expect(value).toEqual({ $expr: "(state) => 1" })
  })

  it("replaces array entries under parallel branches", () => {
    const parallel: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          branches: [[{ id: "inner", uses: "@executioncontrolprotocol/test.echo", input: { value: { $expr: "1" } } }]],
        },
      ],
    }
    const pointer = inputManifestPointer(parallel, "inner", "value")
    const next = replaceManifestPointer(parallel, pointer!, { $expr: "2" })
    expect(readManifestPointer(next, pointer!)).toEqual({ $expr: "2" })
  })
})

describe("valueAtStateRef", () => {
  it("walks state along a ref path", () => {
    expect(valueAtStateRef({ doc: { title: "hi" } }, "state.doc.title")).toBe("hi")
  })

  it("returns undefined when state or path is missing", () => {
    expect(valueAtStateRef(undefined, "state.x")).toBeUndefined()
    expect(valueAtStateRef({ a: 1 }, undefined)).toBeUndefined()
    expect(valueAtStateRef({ a: null }, "state.a.b")).toBeUndefined()
  })
})

describe("valueAtInputPath", () => {
  it("walks nested input objects", () => {
    expect(valueAtInputPath({ edits: { layers: [{ id: 1 }] } }, "edits.layers")).toEqual([{ id: 1 }])
  })

  it("returns the whole input when the path is empty", () => {
    expect(valueAtInputPath({ ok: true }, "")).toEqual({ ok: true })
  })
})

describe("readManifestPointer", () => {
  it("rejects pointers without a leading slash", () => {
    expect(readManifestPointer(manifest, "steps/0")).toBeUndefined()
  })
})
describe("edge-manifest structure walks", () => {
  const nested: ExecutionManifest = {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      {
        type: "branch",
        id: "pick",
        branches: [
          {
            expr: "(state) => state.on",
            steps: [{ id: "armStep", uses: "@x/a", input: { v: { $expr: "(state) => state.a" } }, as: "a" }],
          },
        ],
      },
      {
        type: "loop",
        id: "again",
        expr: "(state) => !state.done",
        maxRounds: 2,
        steps: [{ id: "bodyStep", uses: "@x/b", input: { w: { $ref: "state.a" } }, as: "b", expr: "(state) => true" }],
      },
    ],
  }

  it("finds steps inside branch arms and loop bodies", () => {
    expect(dataEdgeInspectorMeta(nested, "armStep", "v")?.exprSource).toBe("(state) => state.a")
    expect(dataEdgeInspectorMeta(nested, "bodyStep", "w")?.refPath).toBe("state.a")
    // The step's own expr gate is found through the loop too.
    expect(dataEdgeInspectorMeta(nested, "bodyStep", "expr")?.exprSource).toBe("(state) => true")
    expect(inputManifestPointer(nested, "armStep", "v")).toBe("/steps/0/branches/0/steps/0/input/v")
  })

  it("returns undefined for a step that doesn't exist", () => {
    expect(dataEdgeInspectorMeta(nested, "missing", "v")).toBeUndefined()
    expect(dataEdgeInspectorMeta(nested, "missing", "expr")).toBeUndefined()
    expect(inputManifestPointer(nested, "missing", "v")).toBeUndefined()
  })
})

describe("manifest pointer edits", () => {
  it("leaves the manifest unchanged for a pointer without a leading slash", () => {
    expect(replaceManifestPointer(manifest, "steps/0", 1)).toBe(manifest)
  })

  it("unescapes ~1 and ~0 in pointer segments when reading and writing", () => {
    const withKeys = {
      ...manifest,
      steps: [{ id: "k", uses: "@x/k", input: { "a/b": 1, "c~d": 2 }, as: "k" }],
    } as ExecutionManifest
    expect(readManifestPointer(withKeys, "/steps/0/input/a~1b")).toBe(1)
    expect(readManifestPointer(withKeys, "/steps/0/input/c~0d")).toBe(2)
    const updated = replaceManifestPointer(withKeys, "/steps/0/input/a~1b", 9)
    expect(readManifestPointer(updated, "/steps/0/input/a~1b")).toBe(9)
    // Immutable: the original is untouched.
    expect(readManifestPointer(withKeys, "/steps/0/input/a~1b")).toBe(1)
  })

  it("reading through a primitive returns undefined", () => {
    expect(readManifestPointer(manifest, "/version/0/x")).toBeUndefined()
  })

  it("rejects a non-integer array index and a path through a primitive", () => {
    expect(() => replaceManifestPointer(manifest, "/steps/first", 1)).toThrow(/array index/)
    expect(() => replaceManifestPointer(manifest, "/version/x/y", 1)).toThrow(/manifest path/)
  })
})
