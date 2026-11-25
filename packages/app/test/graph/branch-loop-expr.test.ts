import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { executionToReactFlow, routeEdgeInspectorMeta } from "../../src/graph/index.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")

describe("branch-loop expr inspector", () => {
  it("reads arm expr from route edge", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "examples/branch-loop/branch-loop.ecp.json"), "utf8"),
    ) as ExecutionManifest
    const doc = executionToReactFlow(manifest)
    const edge = doc.edges.find((entry) => entry.data.kind === "route" && entry.target === "expanded")
    expect(edge).toBeDefined()
    const meta = routeEdgeInspectorMeta(manifest, edge!.data as never, 0)
    expect(meta?.exprSource).toBe("(state) => state.expand === true")
  })
})