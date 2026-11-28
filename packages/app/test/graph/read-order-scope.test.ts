import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { EXECUTION_ACCEPTS_NODE_ID } from "../../src/graph/io-from-schema.js"
import { IF_ELSE_HANDLE, IF_THEN_HANDLE, PARALLEL_PATH_HANDLE_PREFIX } from "../../src/graph/types.js"
import { scopeForStateRef, sourceScope } from "../../src/graph/read-order.js"

const echo = "@executioncontrolprotocol/test.echo"

describe("sourceScope", () => {
  it("returns empty scope for Inputs", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", then: [] }],
    }
    expect(sourceScope(manifest, { nodeId: EXECUTION_ACCEPTS_NODE_ID, handleId: "mode" })).toEqual([])
  })

  it("tags if side outputs", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          as: "g",
          then: [{ id: "t", uses: echo, as: "t" }],
          else: [{ id: "e", uses: echo, as: "e" }],
        },
      ],
    }
    expect(sourceScope(manifest, { nodeId: "g", handleId: IF_THEN_HANDLE })).toEqual([
      { kind: "if", id: "g", side: "then" },
    ])
    expect(sourceScope(manifest, { nodeId: "g", handleId: IF_ELSE_HANDLE })).toEqual([
      { kind: "if", id: "g", side: "else" },
    ])
  })

  it("tags parallel path outputs", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          as: "p",
          paths: [
            [{ id: "a", uses: echo, as: "a" }],
            [{ id: "b", uses: echo, as: "b" }],
          ],
        },
      ],
    }
    expect(sourceScope(manifest, { nodeId: "p", handleId: `${PARALLEL_PATH_HANDLE_PREFIX}2` })).toEqual([
      { kind: "parallel", id: "p", index: 1 },
    ])
  })
})

describe("scopeForStateRef", () => {
  it("finds a writer step scope", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "g",
          expression: "true",
          then: [{ id: "t", uses: echo, as: "t" }],
          else: [{ id: "e", uses: echo, as: "e" }],
        },
      ],
    }
    expect(scopeForStateRef(manifest, "state.t")).toEqual([{ kind: "if", id: "g", side: "then" }])
    expect(scopeForStateRef(manifest, "state.e")).toEqual([{ kind: "if", id: "g", side: "else" }])
  })
})