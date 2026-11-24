import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  acceptsPropertyKeys,
  detachedNodeIds,
  executionToReactFlow,
  EXECUTION_RETURNS_NODE_ID,
  returnsSourceKeys,
  stateReadsFromExpr,
  walkInputRefs,
  type ReactFlowDocument,
  type ReactFlowEdge,
  type ReactFlowRouteEdgeData,
} from "../../src/graph/index.js"
import { jsonSchemaObjectProperties } from "../../src/graph/json-schema.js"
import { FLOW_IN_HANDLE, FLOW_OUT_HANDLE, LOOP_ITEM_HANDLE } from "../../src/graph/types.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../../../..")
const validDir = path.join(repoRoot, "fixtures/manifests/valid")
const examplesDir = path.join(repoRoot, "examples")

function listEcpJson(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".ecp.json"))
      .map((name) => path.join(dir, name))
      .sort()
  } catch {
    return []
  }
}

function walkExamples(dir: string, out: string[] = []): string[] {
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Array<{
      name: string
      isDirectory: () => boolean
      isFile: () => boolean
    }>
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkExamples(full, out)
    else if (entry.isFile() && entry.name.endsWith(".ecp.json")) out.push(full)
  }
  return out.sort()
}

const manifestPaths = [...listEcpJson(validDir), ...walkExamples(examplesDir)]

function loadManifest(file: string): ExecutionManifest {
  return JSON.parse(readFileSync(file, "utf8")) as ExecutionManifest
}

function dataEdges(doc: ReactFlowDocument): ReactFlowEdge[] {
  return doc.edges.filter((edge) => edge.data.kind === "data")
}

function assertC2(doc: ReactFlowDocument, file: string, manifest?: ExecutionManifest): void {
  const connected = new Set<string>()
  for (const edge of doc.edges) {
    connected.add(edge.source)
    connected.add(edge.target)
  }
  const exempt = manifest ? detachedNodeIds(manifest) : new Set<string>()
  for (const node of doc.nodes) {
    if (node.type === "ecp-frame") continue
    if (exempt.has(node.id)) continue
    expect(connected.has(node.id), `${file} orphaned node ${node.id}`).toBe(true)
  }
}

type AnyNode = Record<string, unknown> & { id: string; type?: string; steps?: AnyNode[] }

/** Visit every node in the manifest, depth first, including loop bodies and branch / parallel arms. */
function forEachNode(nodes: AnyNode[], visit: (node: AnyNode) => void): void {
  for (const node of nodes) {
    visit(node)
    if (Array.isArray(node.steps)) forEachNode(node.steps, visit)
    if (Array.isArray(node.branches)) {
      for (const branch of node.branches as unknown[]) {
        if (Array.isArray(branch)) forEachNode(branch as AnyNode[], visit)
        else if (branch && typeof branch === "object" && Array.isArray((branch as AnyNode).steps)) {
          forEachNode((branch as AnyNode).steps!, visit)
        }
      }
    }
  }
}

/** Every state key the manifest can produce: execution inputs, step `as`, loop `into` and item keys. */
function knownKeys(manifest: ExecutionManifest): Set<string> {
  const keys = new Set(acceptsPropertyKeys(manifest))
  forEachNode((manifest.steps ?? []) as unknown as AnyNode[], (node) => {
    if (typeof node.as === "string") {
      keys.add(node.as)
      if (node.type === "loop" && node.mode === "forEach") keys.add(`${node.as}Index`)
    }
    if (typeof node.into === "string") keys.add(node.into)
  })
  return keys
}

const withStatePrefix = (path: string): string => (path.startsWith("state.") ? path : `state.${path}`)

/**
 * C1, checked from the manifest alone (not from the edge builder): every `$ref` in a step input, every state read in
 * a step or loop `expr`, and every loop `ref` / `collect` has a data edge into that node carrying that state path.
 * Reads of keys nothing produces (an optional ref with a fallback) are skipped.
 */
function assertC1(manifest: ExecutionManifest, doc: ReactFlowDocument, file: string): void {
  const keys = knownKeys(manifest)
  const edges = dataEdges(doc)
  // One edge per state key and node is enough: `state.tick` and `state.tick.echo` in one expression share an edge.
  const keyOf = (path: string): string => withStatePrefix(path).slice("state.".length).split(".")[0] ?? ""
  const expectEdge = (nodeId: string, statePath: string, what: string): void => {
    const wanted = withStatePrefix(statePath)
    if (!keys.has(keyOf(wanted))) return
    const found = edges.some(
      (edge) => edge.target === nodeId && keyOf((edge.data as { statePath?: string }).statePath ?? "") === keyOf(wanted),
    )
    expect(found, `${file}: no edge into ${nodeId} for ${what} (${wanted})`).toBe(true)
  }
  forEachNode((manifest.steps ?? []) as unknown as AnyNode[], (node) => {
    if (node.type === "loop") {
      if (typeof node.ref === "string") expectEdge(node.id, node.ref, "loop ref")
      if (typeof node.collect === "string") expectEdge(node.id, node.collect, "loop collect")
      if (typeof node.expr === "string") {
        for (const read of stateReadsFromExpr(node.expr)) expectEdge(node.id, read, "loop expr")
      }
      return
    }
    if (node.type !== undefined && node.type !== "step") return
    if (node.input && typeof node.input === "object") {
      for (const [name, value] of Object.entries(node.input as Record<string, unknown>)) {
        walkInputRefs(value, name, (inputPath, refPath) => {
          if (refPath.startsWith("state.")) expectEdge(node.id, refPath, `input ${inputPath}`)
        })
      }
    }
    if (typeof node.expr === "string") {
      for (const read of stateReadsFromExpr(node.expr)) expectEdge(node.id, read, "expr gate")
    }
  })

  const acceptsKeys = acceptsPropertyKeys(manifest)
  const writers = returnsSourceKeys(manifest)
  for (const field of jsonSchemaObjectProperties(manifest.execution?.returns)) {
    if (!writers.has(field.name) && !acceptsKeys.has(field.name)) continue
    expect(
      dataEdges(doc).some((e) => e.target === EXECUTION_RETURNS_NODE_ID && e.targetHandle === field.name),
      `${file} returns ${field.name}`,
    ).toBe(true)
  }
}

/** Per-fixture connectivity verdict for the implementation report. */
export const connectivityResults: Array<{ file: string; ok: boolean }> = []

describe("graph connectivity invariant", () => {
  it("finds manifests to check", () => {
    expect(manifestPaths.length).toBeGreaterThan(5)
  })

  it.each(manifestPaths)("%s satisfies C1 and C2", (file) => {
    const manifest = loadManifest(file)
    const doc = executionToReactFlow(manifest)
    const relative = path.relative(repoRoot, file)
    try {
      assertC1(manifest, doc, relative)
      assertC2(doc, relative, manifest)
      connectivityResults.push({ file: relative, ok: true })
    } catch (error) {
      connectivityResults.push({ file: relative, ok: false })
      throw error
    }
  })
})

describe("connectivity focused cases", () => {
  it("forEach item and asIndex edges; innermost binder wins", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "outer",
          ref: "state.items",
          as: "item",
          into: "out",
          steps: [
            {
              type: "loop",
              mode: "forEach",
              id: "inner",
              ref: "state.item.parts",
              as: "part",
              into: "parts",
              steps: [
                {
                  id: "use-part",
                  uses: "@executioncontrolprotocol/test.echo",
                  input: { value: { $ref: "state.part" } },
                },
                {
                  id: "use-index",
                  uses: "@executioncontrolprotocol/test.echo",
                  input: { value: { $ref: "state.partIndex" } },
                },
              ],
            },
            {
              id: "use-item",
              uses: "@executioncontrolprotocol/test.echo",
              input: { value: { $ref: "state.item" } },
            },
          ],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const data = dataEdges(doc)
    expect(data).toContainEqual(expect.objectContaining({ source: "inner", sourceHandle: LOOP_ITEM_HANDLE, target: "use-part" }))
    expect(data).toContainEqual(expect.objectContaining({ source: "inner", sourceHandle: LOOP_ITEM_HANDLE, target: "use-index" }))
    expect(data).toContainEqual(expect.objectContaining({ source: "outer", sourceHandle: LOOP_ITEM_HANDLE, target: "use-item" }))
  })

  it("same key as another loop as resolves to document-order writer outside the loop", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "write-published", uses: "@executioncontrolprotocol/test.echo", as: "published" },
        {
          type: "loop",
          mode: "forEach",
          id: "cleanup",
          ref: "state.items",
          as: "published",
          into: "done",
          steps: [{ id: "in-loop", uses: "@executioncontrolprotocol/test.echo", as: "other" }],
        },
        {
          id: "read-published",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $ref: "state.published" } },
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    expect(dataEdges(doc)).toContainEqual(
      expect.objectContaining({ source: "write-published", target: "read-published" }),
    )
  })

  it("for iteration variable edge", () => {
    const doc = executionToReactFlow(loadManifest(path.join(validDir, "loop-for.ecp.json")))
    expect(dataEdges(doc)).toContainEqual(
      expect.objectContaining({ source: "rounds", sourceHandle: LOOP_ITEM_HANDLE, target: "tick" }),
    )
  })

  it.each(manifestPaths)("%s route edges use flow handles", (file) => {
    const doc = executionToReactFlow(loadManifest(file))
    for (const edge of doc.edges) {
      if (edge.data.kind !== "route") continue
      expect(edge.sourceHandle, `${file} ${edge.id} sourceHandle`).toBe(FLOW_OUT_HANDLE)
      expect(edge.targetHandle, `${file} ${edge.id} targetHandle`).toBe(FLOW_IN_HANDLE)
    }
  })

  it.each(manifestPaths)("%s publishes every branch arm expr on a route edge level", (file) => {
    const manifest = loadManifest(file)
    const expected: Array<{ structureId: string; armIndex: number; expr: string }> = []
    const walk = (nodes: AnyNode[]): void => {
      for (const node of nodes) {
        if (node.type === "branch") {
          const arms = node.branches as Array<{ expr?: string; steps?: AnyNode[] }>
          arms.forEach((arm, armIndex) => {
            if (typeof arm.expr === "string") {
              expected.push({ structureId: node.id, armIndex, expr: arm.expr })
            }
            if (arm.steps) walk(arm.steps)
          })
        } else if (node.type === "parallel") {
          for (const line of node.branches as AnyNode[][]) walk(line)
        } else if (node.type === "loop" && node.steps) {
          walk(node.steps as AnyNode[])
        }
      }
    }
    walk((manifest.steps ?? []) as AnyNode[])
    const doc = executionToReactFlow(manifest)
    const found = new Set<string>()
    for (const edge of doc.edges) {
      if (edge.data.kind !== "route") continue
      const data = edge.data as ReactFlowRouteEdgeData
      for (const level of data.levels) {
        if (level.route === "branch" && typeof level.exprSource === "string") {
          found.add(`${level.structureId}:${level.armIndex}:${level.exprSource}`)
        }
      }
    }
    for (const arm of expected) {
      expect(found.has(`${arm.structureId}:${arm.armIndex}:${arm.expr}`), `${file} missing arm ${arm.structureId}[${arm.armIndex}]`).toBe(
        true,
      )
    }
  })
})