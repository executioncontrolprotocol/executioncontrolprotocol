import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { executionToReactFlow } from "../../src/graph/index.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")

describe("branch-loop data inspector", () => {
  it("encodes an if input reference as a data edge with its binding path", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json"), "utf8"),
    ) as ExecutionManifest
    const doc = executionToReactFlow(manifest)
    expect(doc.edges.every((e) => e.data.kind === "data")).toBe(true)
    const ifNode = manifest.steps.find((node) => node.type === "if")
    expect(ifNode).toBeDefined()
    if (ifNode?.type === "if" && ifNode.input) {
      const keys = Object.keys(ifNode.input)
      if (keys[0]) {
        const edge = doc.edges.find((entry) => entry.target === ifNode.id)
        expect(edge?.data.kind === "data" && edge.data.bindingPath).toBeTruthy()
      }
    }
  })
})
