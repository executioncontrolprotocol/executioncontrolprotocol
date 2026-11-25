import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  dataEdgeInspectorMeta,
  inputManifestPointer,
  readManifestPointer,
  replaceManifestPointer,
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
          $ref: "state.doc.title",
        },
      },
      as: "out",
    },
    {
      type: "if",
      id: "pick",
      expression: "state.flag === true",
      then: [{ id: "a", uses: "@executioncontrolprotocol/test.echo" }],
      else: [{ id: "b", uses: "@executioncontrolprotocol/test.echo" }],
    },
    {
      type: "loop",
      id: "loop",
      mode: "while",
      maxRounds: 3,
      steps: [{ id: "c", uses: "@executioncontrolprotocol/test.echo" }],
      end: { input: { repeat: { $ref: "state.on" } }, expression: "true" },
    },
  ],
}

describe("dataEdgeInspectorMeta", () => {
  it("reads optional ref without fallback field", () => {
    const optionalOnly: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "reader",
          uses: "@executioncontrolprotocol/test.echo",
          input: { flat: { $ref: "state.seed", optional: true } },
        },
      ],
    }
    const meta = dataEdgeInspectorMeta(optionalOnly, "reader", "flat")
    expect(meta?.optional).toBe(true)
    expect(meta?.fallback).toBeUndefined()
  })

  it("reads optional ref with fallback", () => {
    const meta = dataEdgeInspectorMeta(manifest, "reader", "flat")
    expect(meta?.markerKind).toBe("ref")
    expect(meta?.optional).toBe(true)
    expect(meta?.fallback).toBe("x")
    expect(meta?.refPath).toBe("state.seed")
  })

  it("reads $ref on a nested input path", () => {
    const meta = dataEdgeInspectorMeta(manifest, "reader", "nested")
    expect(meta?.markerKind).toBe("ref")
    expect(meta?.refPath).toBe("state.doc.title")
  })

  it("returns undefined for a missing input path", () => {
    expect(dataEdgeInspectorMeta(manifest, "reader", "missing")).toBeUndefined()
  })

  it("reads $expr on an input path", () => {
    const exprManifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { seed: { $expr: "state.x" } } }],
    }
    const meta = dataEdgeInspectorMeta(exprManifest, "s", "seed")
    expect(meta?.markerKind).toBe("expr")
    expect(meta?.exprSource).toBe("state.x")
    expect(meta?.validatePointer).toBe("/steps/0/input/seed/$expr")
  })

  it("returns undefined when the input value is not a ref or expr", () => {
    const plain: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "plain", uses: "@executioncontrolprotocol/test.echo", input: { value: "hello" } }],
    }
    expect(dataEdgeInspectorMeta(plain, "plain", "value")).toBeUndefined()
  })

  it("finds steps nested under parallel paths", () => {
    const parallel: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [{ id: "inner", uses: "@executioncontrolprotocol/test.echo", input: { value: { $ref: "state.x" } } }],
          ],
        },
      ],
    }
    expect(dataEdgeInspectorMeta(parallel, "inner", "value")?.markerKind).toBe("ref")
  })
})

describe("replaceManifestPointer", () => {
  it("replaces a $ref target", () => {
    const pointer = inputManifestPointer(manifest, "reader", "nested")
    expect(pointer).toBeDefined()
    const next = replaceManifestPointer(manifest, pointer!, { $ref: "state.other" })
    const value = readManifestPointer(next, pointer!)
    expect(value).toEqual({ $ref: "state.other" })
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
        type: "if",
        id: "pick",
        expression: "state.on",
        then: [{ id: "thenStep", uses: "@x/a", input: { v: { $ref: "state.a" } }, as: "a" }],
      },
      {
        type: "loop",
        id: "again",
        mode: "while",
        maxRounds: 2,
        steps: [{ id: "bodyStep", uses: "@x/b", input: { w: { $ref: "state.a" } }, as: "b" }],
        end: { input: { repeat: false } },
      },
    ],
  }

  it("finds steps inside if sides and loop bodies", () => {
    expect(dataEdgeInspectorMeta(nested, "thenStep", "v")?.refPath).toBe("state.a")
    expect(dataEdgeInspectorMeta(nested, "bodyStep", "w")?.refPath).toBe("state.a")
    expect(inputManifestPointer(nested, "thenStep", "v")).toBe("/steps/0/then/0/input/v")
  })

  it("returns undefined for a step that doesn't exist", () => {
    expect(dataEdgeInspectorMeta(nested, "missing", "v")).toBeUndefined()
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
