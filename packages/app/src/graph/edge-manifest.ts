import type { ExecutionManifest, Node, StepNode, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { isExprMarker, isRefMarker, refPathFromValue } from "./markers.js"

/**
 * Marker kind carried on a data edge for the edge inspector.
 * @category App
 */
export type DataEdgeMarkerKind = "ref" | "expr"

/**
 * Metadata for a data-edge inspector: manifest pointer and binding details.
 * @category App
 */
export interface DataEdgeInspectorMeta {
  /** JSON Pointer into the manifest (RFC 6901 segments). */
  manifestPointer: string
  /** Validation pointer for `ECP_EXPR_INVALID` (includes `/$expr` when needed). */
  validatePointer: string
  /** What the edge binds. */
  markerKind: DataEdgeMarkerKind
  /** State path for a `$ref` or a read inside `$expr`. */
  refPath?: string
  /** Optional flag on a `$ref` marker. */
  optional?: boolean
  /** Fallback on an optional `$ref`. */
  fallback?: unknown
  /** `$expr` source text. */
  exprSource?: string
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function findNodePath(document: unknown, nodeId: string, prefix: string[] = []): string[] | undefined {
  if (!isRecord(document)) return undefined
  if (Array.isArray(document.steps)) {
    for (let index = 0; index < document.steps.length; index += 1) {
      const step = document.steps[index]
      const here = [...prefix, "steps", String(index)]
      if (isRecord(step) && step.id === nodeId) return here
      const nested = findNodePath(step, nodeId, here)
      if (nested) return nested
    }
  }
  if (Array.isArray(document.then)) {
    for (let index = 0; index < document.then.length; index += 1) {
      const step = document.then[index]
      const here = [...prefix, "then", String(index)]
      if (isRecord(step) && step.id === nodeId) return here
      const nested = findNodePath(step, nodeId, here)
      if (nested) return nested
    }
  }
  if (Array.isArray(document.else)) {
    for (let index = 0; index < document.else.length; index += 1) {
      const step = document.else[index]
      const here = [...prefix, "else", String(index)]
      if (isRecord(step) && step.id === nodeId) return here
      const nested = findNodePath(step, nodeId, here)
      if (nested) return nested
    }
  }
  if (Array.isArray(document.paths)) {
    for (let pathIndex = 0; pathIndex < document.paths.length; pathIndex += 1) {
      const path = document.paths[pathIndex]
      if (!Array.isArray(path)) continue
      for (let index = 0; index < path.length; index += 1) {
        const step = path[index]
        const here = [...prefix, "paths", String(pathIndex), String(index)]
        if (isRecord(step) && step.id === nodeId) return here
        const nested = findNodePath(step, nodeId, here)
        if (nested) return nested
      }
    }
  }
  return undefined
}

/**
 * JSON Pointer (`/steps/...`) to a step node id in the manifest.
 * @category App
 */
export function stepManifestPointer(manifest: ExecutionManifest, stepId: string): string | undefined {
  const segments = findNodePath(manifest, stepId)
  if (!segments) return undefined
  return `/${segments.join("/")}`
}

/**
 * JSON Pointer to an `input` field on a step (`inputPath` is a dotted path under `input`).
 * @category App
 */
export function inputManifestPointer(manifest: ExecutionManifest, stepId: string, inputPath: string): string | undefined {
  const stepPointer = stepManifestPointer(manifest, stepId)
  if (!stepPointer) return undefined
  if (!inputPath) return `${stepPointer}/input`
  const tail = inputPath
    .split(".")
    .filter(Boolean)
    .map(escapePointerSegment)
    .join("/")
  return `${stepPointer}/input/${tail}`
}

/**
 * Inspector metadata for a data edge resolved from the manifest and graph handles.
 * @category App
 */
export function dataEdgeInspectorMeta(
  manifest: ExecutionManifest,
  targetStepId: string,
  targetHandle: string,
): DataEdgeInspectorMeta | undefined {
  const pointer = inputManifestPointer(manifest, targetStepId, targetHandle)
  if (!pointer) return undefined
  const value = readManifestPointer(manifest, pointer)
  const refPath = refPathFromValue(value)
  if (refPath !== undefined) {
    return {
      manifestPointer: pointer,
      validatePointer: pointer,
      markerKind: "ref",
      refPath,
      ...(isRefMarker(value) && value.optional === true ? { optional: true } : {}),
      ...(isRefMarker(value) && value.optional === true && "fallback" in value ? { fallback: value.fallback } : {}),
    }
  }
  if (isExprMarker(value)) {
    return {
      manifestPointer: pointer,
      validatePointer: `${pointer}/$expr`,
      markerKind: "expr",
      exprSource: value.$expr,
    }
  }
  return undefined
}

/** @internal */
export function stepById(manifest: ExecutionManifest, stepId: string): StepNode | undefined {
  const steps: StepNode[] = []
  collectStepNodes(manifest.steps ?? [], steps)
  return steps.find((step) => step.id === stepId)
}

function collectStepNodes(nodes: Node[], out: StepNode[]): void {
  for (const node of nodes) {
    if ("uses" in node && typeof node.uses === "string") {
      out.push(node as StepNode)
    } else if (node.type === "parallel") {
      for (const path of node.paths) collectStepNodes(path, out)
    } else if (node.type === "if") {
      collectStepNodes(node.then, out)
      if (node.else) collectStepNodes(node.else, out)
    } else if (node.type === "loop") {
      collectStepNodes(node.steps, out)
    }
  }
}

/**
 * Read a value at a JSON Pointer rooted on the manifest document.
 * @category App
 */
export function readManifestPointer(manifest: ExecutionManifest, pointer: string): unknown {
  if (!pointer.startsWith("/")) return undefined
  let current: unknown = manifest
  for (const raw of pointer.slice(1).split("/")) {
    if (current === null || typeof current !== "object") return undefined
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~")
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Immutable replace at a JSON Pointer on the manifest.
 * @category App
 */
export function replaceManifestPointer(manifest: ExecutionManifest, pointer: string, value: unknown): ExecutionManifest {
  if (!pointer.startsWith("/")) return manifest
  const segments = pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
  const clone = structuredClone(manifest) as ExecutionManifest
  return setAt(clone, segments, value)
}

function setAt(root: unknown, segments: string[], value: unknown): ExecutionManifest {
  if (segments.length === 0) return value as ExecutionManifest
  const [head, ...rest] = segments
  if (!isRecord(root) && !Array.isArray(root)) throw new Error("Invalid manifest path.")
  if (rest.length === 0) {
    if (Array.isArray(root) && head !== undefined) {
      const copy = [...root]
      const index = Number(head)
      if (!Number.isInteger(index)) throw new Error("Invalid array index.")
      copy[index] = value
      return copy as unknown as ExecutionManifest
    }
    return { ...(root as Record<string, unknown>), [head ?? ""]: value } as unknown as ExecutionManifest
  }
  const child = Array.isArray(root)
    ? root[Number(head)]
    : (root as Record<string, unknown>)[head ?? ""]
  const next = setAt(child, rest, value)
  if (Array.isArray(root) && head !== undefined) {
    const copy = [...root]
    copy[Number(head)] = next
    return copy as unknown as ExecutionManifest
  }
  return { ...(root as Record<string, unknown>), [head ?? ""]: next } as unknown as ExecutionManifest
}

/**
 * Walk dotted or `state.`-prefixed ref path on resolved run state.
 * @category App
 */
export function valueAtStateRef(state: Record<string, unknown> | undefined, refPath: string | undefined): unknown {
  if (!state || !refPath) return undefined
  const normalized = refPath.startsWith("state.") ? refPath.slice("state.".length) : refPath
  let current: unknown = state
  for (const segment of normalized.split(".").filter(Boolean)) {
    if (current === null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Read a dotted field on a step's resolved input object.
 * @category App
 */
export function valueAtInputPath(input: unknown, dottedPath: string): unknown {
  if (!dottedPath) return input
  let current = input
  for (const segment of dottedPath.split(".").filter(Boolean)) {
    if (current === null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * `ECP_EXPR_INVALID` issues at `validatePointer` only.
 * @category App
 */
export function exprIssuesAtPointer(issues: readonly ValidationIssue[], validatePointer: string): ValidationIssue[] {
  return issues.filter(
    (issue) => issue.code === "ECP_EXPR_INVALID" && issue.path === validatePointer,
  )
}