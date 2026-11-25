import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest, Node } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  acceptsPropertyKeys,
  executionToReactFlow,
  EXECUTION_RETURNS_NODE_ID,
  extractDataEdges,
  loopEndNodeId,
  resolveInputHandle,
  returnsSourceKeys,
  walkInputRefs,
  type ReactFlowDocument,
  type ReactFlowEdge,
} from "../../src/graph/index.js"
import { jsonSchemaObjectProperties } from "../../src/graph/json-schema.js"
import { isStepNode } from "../../src/graph/io-from-schema.js"
import { LOOP_INDEX_HANDLE, LOOP_ITEM_HANDLE } from "../../src/graph/types.js"

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

interface RefBinding {
  readerId: string
  inputPath: string
  refPath: string
}

function inputPortIds(manifest: ExecutionManifest): Map<string, string[]> {
  const doc = executionToReactFlow(manifest)
  const out = new Map<string, string[]>()
  for (const node of doc.nodes) {
    if (node.type === "ecp-step" || node.type === "ecp-if" || node.type === "ecp-parallel" || node.type === "ecp-loop" || node.type === "ecp-end") {
      const data = node.data as { inputs: Array<{ id: string }> }
      out.set(node.id, data.inputs.map((port) => port.id))
    }
  }
  return out
}

function collectRefBindings(nodes: Node[]): RefBinding[] {
  const bindings: RefBinding[] = []
  const walk = (list: Node[]): void => {
    for (const node of list) {
      if (node.type === "if" || node.type === "parallel") {
        if (node.input) {
          for (const [name, value] of Object.entries(node.input)) {
            walkInputRefs(value, name, (inputPath, refPath) => {
              if (refPath.startsWith("state.") || refPath.startsWith("$state")) {
                bindings.push({ readerId: node.id, inputPath, refPath })
              }
            })
          }
        }
        if (node.type === "if") {
          walk(node.then)
          if (node.else) walk(node.else)
        } else {
          for (const pathNodes of node.paths) walk(pathNodes)
        }
      } else if (node.type === "loop") {
        if (node.input) {
          for (const [name, value] of Object.entries(node.input)) {
            walkInputRefs(value, name, (inputPath, refPath) => {
              if (refPath.startsWith("state.") || refPath.startsWith("$state")) {
                bindings.push({ readerId: node.id, inputPath, refPath })
              }
            })
          }
        }
        const endId = loopEndNodeId(node.id)
        if (node.end?.input) {
          for (const [name, value] of Object.entries(node.end.input)) {
            walkInputRefs(value, name, (inputPath, refPath) => {
              if (refPath.startsWith("state.") || refPath.startsWith("$state")) {
                bindings.push({ readerId: endId, inputPath, refPath })
              }
            })
          }
        }
        walk(node.steps)
      } else if (isStepNode(node) && node.input) {
        for (const [name, value] of Object.entries(node.input)) {
          walkInputRefs(value, name, (inputPath, refPath) => {
            if (refPath.startsWith("state.") || refPath.startsWith("$state")) {
              bindings.push({ readerId: node.id, inputPath, refPath })
            }
          })
        }
      }
    }
  }
  walk(nodes)
  return bindings
}

/**
 * C1: every manifest `$ref` has a published data branch with matching source/target nodes and ports (Resolution 6).
 */
function assertC1(manifest: ExecutionManifest, doc: ReactFlowDocument, file: string): void {
  const steps = Array.isArray(manifest.steps) ? manifest.steps : []
  const bindings = collectRefBindings(steps)
  const portIds = inputPortIds(manifest)
  const published = dataEdges(doc)

  const outputPortIds = new Map<string, string[]>()
  for (const node of doc.nodes) {
    if (node.type === "ecp-step" || node.type === "ecp-if" || node.type === "ecp-parallel" || node.type === "ecp-loop" || node.type === "ecp-end" || node.type === "ecp-io") {
      const data = node.data as { outputs?: Array<{ id: string }> }
      if (data.outputs) outputPortIds.set(node.id, data.outputs.map((port) => port.id))
    }
  }

  const acceptsKeys = acceptsPropertyKeys(manifest)
  const expectedFromExtract = extractDataEdges(steps, acceptsKeys, outputPortIds, portIds)

  for (const binding of bindings) {
    const targetHandle = resolveInputHandle(binding.inputPath, portIds.get(binding.readerId))
    const fromExtract = expectedFromExtract.find(
      (edge) =>
        edge.target === binding.readerId &&
        edge.targetHandle === targetHandle &&
        (edge.data as { statePath?: string }).statePath === binding.refPath,
    )
    expect(fromExtract, `${file}: no branch for ${binding.readerId}.${binding.inputPath} (${binding.refPath})`).toBeDefined()
    const onCanvas = published.find(
      (edge) =>
        edge.target === binding.readerId &&
        edge.targetHandle === targetHandle &&
        edge.source === fromExtract!.source &&
        edge.sourceHandle === fromExtract!.sourceHandle,
    )
    expect(onCanvas, `${file}: branch ${binding.refPath} not published on canvas`).toBeDefined()
  }

  const writers = returnsSourceKeys(manifest)
  const acceptsKeysSchema = acceptsPropertyKeys(manifest)
  for (const field of jsonSchemaObjectProperties(manifest.execution?.returns)) {
    if (!writers.has(field.name) && !acceptsKeysSchema.has(field.name)) continue
    expect(
      published.some((e) => e.target === EXECUTION_RETURNS_NODE_ID && e.targetHandle === field.name),
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

  it.each(manifestPaths)("%s satisfies C1", (file) => {
    const manifest = loadManifest(file)
    const doc = executionToReactFlow(manifest)
    const relative = path.relative(repoRoot, file)
    try {
      assertC1(manifest, doc, relative)
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
          input: { items: { $ref: "state.items" } },
          as: "item",
          into: "out",
          steps: [
            {
              type: "loop",
              mode: "forEach",
              id: "inner",
              input: { items: { $ref: "state.item.parts" } },
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
              end: { input: {} },
            },
            {
              id: "use-item",
              uses: "@executioncontrolprotocol/test.echo",
              input: { value: { $ref: "state.item" } },
            },
          ],
          end: { input: {} },
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const data = dataEdges(doc)
    expect(data).toContainEqual(expect.objectContaining({ source: "inner", sourceHandle: LOOP_ITEM_HANDLE, target: "use-part" }))
    expect(data).toContainEqual(expect.objectContaining({ source: "inner", sourceHandle: LOOP_INDEX_HANDLE, target: "use-index" }))
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
          input: { items: { $ref: "state.items" } },
          as: "published",
          into: "done",
          steps: [{ id: "in-loop", uses: "@executioncontrolprotocol/test.echo", as: "other" }],
          end: { input: {} },
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
      expect.objectContaining({ source: "rounds", sourceHandle: LOOP_INDEX_HANDLE, target: "tick" }),
    )
  })

  it("if input and loop end repeat branches", () => {
    const branch = executionToReactFlow(loadManifest(path.join(examplesDir, "patterns/branch.ecp.json")))
    expect(dataEdges(branch)).toContainEqual(
      expect.objectContaining({ target: "by-tier", targetHandle: "tier", sourceHandle: "tier" }),
    )
    const loopWhile = executionToReactFlow(loadManifest(path.join(examplesDir, "patterns/loop-while.ecp.json")))
    expect(dataEdges(loopWhile)).toContainEqual(
      expect.objectContaining({ target: "end:retry", targetHandle: "repeat" }),
    )
  })

  it("ref to if as from outside the if draws nothing", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "gate",
          expression: "true",
          input: { x: 1 },
          as: "scoped",
          then: [{ id: "in-then", uses: "@executioncontrolprotocol/test.echo", input: { value: 1 } }],
        },
        {
          id: "after",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $ref: "state.scoped" } },
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    expect(dataEdges(doc).some((e) => e.target === "after" && (e.data as { statePath?: string }).statePath?.includes("scoped"))).toBe(false)
  })

  it.each(manifestPaths)("%s publishes data edges only", (file) => {
    const doc = executionToReactFlow(loadManifest(file))
    expect(doc.edges.every((edge) => edge.data.kind === "data" || edge.data.kind === "layout-control")).toBe(true)
  })
})