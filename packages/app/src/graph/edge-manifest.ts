import type { ExecutionManifest, Node, StepNode, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { isRefMarker, refPathFromValue } from "./markers.js"
import type { ReactFlowRouteEdgeData } from "./types.js"

/**
 * Marker kind carried on a data edge for the edge inspector.
 * @category App
 */
export type DataEdgeMarkerKind = "ref" | "expr" | "expr-gate"

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
  /** `$expr` or step `expr` source text. */
  exprSource?: string
}

/**
 * Route-edge expr edit target.
 * @category App
 */
export interface RouteEdgeInspectorMeta {
  /** JSON Pointer to the branch arm or loop `expr` string. */
  manifestPointer: string
  /** Same as {@link RouteEdgeInspectorMeta.manifestPointer}. */
  validatePointer: string
  /** Expr source. */
  exprSource?: string
  /** Default branch arm (read-only). */
  defaultArm?: boolean
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
  if (Array.isArray(document.branches)) {
    for (let index = 0; index < document.branches.length; index += 1) {
      const arm = document.branches[index]
      const here = [...prefix, "branches", String(index)]
      if (Array.isArray(arm)) {
        for (let line = 0; line < arm.length; line += 1) {
          const step = arm[line]
          const linePath = [...here, String(line)]
          if (isRecord(step) && step.id === nodeId) return linePath
          const nested = findNodePath(step, nodeId, linePath)
          if (nested) return nested
        }
      } else {
        const nested = findNodePath(arm, nodeId, here)
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
  if (targetHandle === "expr") {
    const base = stepManifestPointer(manifest, targetStepId)
    if (!base) return undefined
    const step = stepById(manifest, targetStepId)
    const exprSource = step?.expr
    return {
      manifestPointer: `${base}/expr`,
      validatePointer: `${base}/expr`,
      markerKind: "expr-gate",
      ...(exprSource ? { exprSource } : {}),
    }
  }
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
  return undefined
}

/**
 * Inspector metadata for a route edge (branch arm or loop `expr`).
 * @category App
 */
export function routeEdgeInspectorMeta(manifest: ExecutionManifest, data: ReactFlowRouteEdgeData): RouteEdgeInspectorMeta | undefined {
  if (data.defaultArm) {
    return { manifestPointer: "", validatePointer: "", defaultArm: true }
  }
  const base = stepManifestPointer(manifest, data.structureId)
  if (!base) return undefined
  if (data.route === "loop") {
    const exprSource = readManifestPointer(manifest, `${base}/expr`)
    return {
      manifestPointer: `${base}/expr`,
      validatePointer: `${base}/expr`,
      ...(typeof exprSource === "string" ? { exprSource } : {}),
    }
  }
  if (data.route === "branch" && data.armIndex !== undefined) {
    const armPointer = `${base}/branches/${data.armIndex}`
    const exprSource = readManifestPointer(manifest, `${armPointer}/expr`)
    return {
      manifestPointer: `${armPointer}/expr`,
      validatePointer: `${armPointer}/expr`,
      ...(typeof exprSource === "string" ? { exprSource } : {}),
    }
  }
  return undefined
}

function stepById(manifest: ExecutionManifest, stepId: string): StepNode | undefined {
  const steps: StepNode[] = []
  collectStepNodes(manifest.steps ?? [], steps)
  return steps.find((step) => step.id === stepId)
}

function collectStepNodes(nodes: Node[], out: StepNode[]): void {
  for (const node of nodes) {
    if ("uses" in node && typeof node.uses === "string") {
      out.push(node as StepNode)
    } else if (node.type === "parallel") {
      for (const line of node.branches) collectStepNodes(line, out)
    } else if (node.type === "branch") {
      for (const arm of node.branches) collectStepNodes(arm.steps, out)
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