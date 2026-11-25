import type { BranchNode, ExecutionManifest, LoopNode, Node } from "@executioncontrolprotocol/protocol"
import { cloneManifest } from "./manifest-walk.js"
import {
  STRUCTURE_EDIT_STRUCTURE_NOT_FOUND,
  type StructureEditResult,
} from "./structure-edit.js"

/** @category App */
export const ROUTE_EDIT_ARM_HAS_CONDITION = "This arm already has a condition"

/** @category App */
export const ROUTE_EDIT_DEFAULT_EXISTS = "Another arm is already the default"


function findBranchPlacement(nodes: Node[], branchId: string): BranchNode | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    if (node.type === "branch" && node.id === branchId) {
      return node
    }
    if (node.type === "branch") {
      for (const arm of node.branches) {
        const hit = findBranchPlacement(arm.steps, branchId)
        if (hit) return hit
      }
    } else if (node.type === "parallel") {
      for (const line of node.branches) {
        const hit = findBranchPlacement(line, branchId)
        if (hit) return hit
      }
    } else if (node.type === "loop") {
      const hit = findBranchPlacement(node.steps, branchId)
      if (hit) return hit
    }
  }
  return undefined
}

function findLoopPlacement(
  nodes: Node[],
  loopId: string,
): { loop: LoopNode } | undefined {
  for (const node of nodes) {
    if (node.type === "loop" && node.id === loopId) return { loop: node }
    if (node.type === "branch") {
      for (const arm of node.branches) {
        const hit = findLoopPlacement(arm.steps, loopId)
        if (hit) return hit
      }
    } else if (node.type === "parallel") {
      for (const line of node.branches) {
        const hit = findLoopPlacement(line, loopId)
        if (hit) return hit
      }
    } else if (node.type === "loop") {
      const hit = findLoopPlacement(node.steps, loopId)
      if (hit) return hit
    }
  }
  return undefined
}

function walkRoots(manifest: ExecutionManifest, visit: (nodes: Node[]) => void): void {
  visit(manifest.steps)
  if (Array.isArray(manifest.detached)) visit(manifest.detached)
}

function locateBranch(manifest: ExecutionManifest, branchId: string): BranchNode | undefined {
  let found: BranchNode | undefined
  walkRoots(manifest, (nodes) => {
    const hit = findBranchPlacement(nodes, branchId)
    if (hit) found = hit
  })
  return found
}

function locateLoop(manifest: ExecutionManifest, loopId: string): LoopNode | undefined {
  let found: LoopNode | undefined
  walkRoots(manifest, (nodes) => {
    const hit = findLoopPlacement(nodes, loopId)
    if (hit) found = hit.loop
  })
  return found
}

const STATE_REF = /^state(?:\.(?:[A-Za-z_$][A-Za-z0-9_$-]*|[0-9]+))+$/
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Set or clear a branch arm label.
 * @category App
 */
export function setArmLabel(
  manifest: ExecutionManifest,
  branchId: string,
  armIndex: number,
  label: string,
): StructureEditResult {
  const next = cloneManifest(manifest)
  const branch = locateBranch(next, branchId)
  if (!branch || armIndex < 0 || armIndex >= branch.branches.length) {
    return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  }
  const arm = branch.branches[armIndex]!
  if (label === "") {
    const rest = { ...arm }
    delete rest.label
    branch.branches[armIndex] = rest
  } else {
    branch.branches[armIndex] = { ...arm, label }
  }
  return { ok: true, manifest: next }
}

/**
 * Add a default conditional expression to an arm that lacks `expr`.
 * @category App
 */
export function addArmCondition(
  manifest: ExecutionManifest,
  branchId: string,
  armIndex: number,
): StructureEditResult {
  const next = cloneManifest(manifest)
  const branch = locateBranch(next, branchId)
  if (!branch || armIndex < 0 || armIndex >= branch.branches.length) {
    return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  }
  const arm = branch.branches[armIndex]!
  if (arm.expr !== undefined) return { ok: false, reason: ROUTE_EDIT_ARM_HAS_CONDITION }
  branch.branches[armIndex] = { ...arm, expr: "(state) => true" }
  return { ok: true, manifest: next }
}

/**
 * Remove `expr` from an arm and move it to the end when it becomes the default arm.
 * @category App
 */
export function makeDefaultArm(
  manifest: ExecutionManifest,
  branchId: string,
  armIndex: number,
): StructureEditResult {
  const next = cloneManifest(manifest)
  const branch = locateBranch(next, branchId)
  if (!branch || armIndex < 0 || armIndex >= branch.branches.length) {
    return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  }
  const otherDefault = branch.branches.some((arm, i) => i !== armIndex && !("expr" in arm))
  if (otherDefault) return { ok: false, reason: ROUTE_EDIT_DEFAULT_EXISTS }
  const arms = [...branch.branches]
  const arm = arms[armIndex]!
  const rest = { ...arm }
  delete rest.expr
  arms.splice(armIndex, 1)
  arms.push(rest)
  branch.branches = arms
  return { ok: true, manifest: next }
}

type LoopField =
  | "ref"
  | "expr"
  | "maxRounds"
  | "as"
  | "into"
  | "collect"
  | "concurrency"
  | "onError"

function loopMode(loop: LoopNode): "while" | "for" | "forEach" {
  return loop.mode ?? "while"
}

function fieldAllowed(mode: "while" | "for" | "forEach", field: LoopField): boolean {
  if (field === "maxRounds") return mode === "while"
  if (field === "as") return mode === "for" || mode === "forEach"
  if (field === "into" || field === "collect" || field === "concurrency" || field === "onError") {
    return mode === "forEach"
  }
  if (field === "ref" || field === "expr") return true
  return false
}

function fieldForbiddenReason(field: LoopField): string {
  if (field === "maxRounds") return "maxRounds is only valid on while"
  if (field === "as") return "as is only valid on for and forEach"
  if (field === "into" || field === "collect" || field === "concurrency" || field === "onError") {
    return `${field} is only valid on forEach`
  }
  return "Field is not valid for this loop mode"
}

/**
 * Update one loop field (mode is read-only).
 * @category App
 */
export function setLoopField(
  manifest: ExecutionManifest,
  loopId: string,
  field: LoopField,
  value: string | number,
): StructureEditResult {
  const next = cloneManifest(manifest)
  const loop = locateLoop(next, loopId)
  if (!loop) return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  const mode = loopMode(loop)
  if (!fieldAllowed(mode, field)) return { ok: false, reason: fieldForbiddenReason(field) }

  if (field === "ref") {
    if (typeof value !== "string" || !STATE_REF.test(value)) {
      return { ok: false, reason: "ref must be a state path" }
    }
    delete loop.expr
    loop.ref = value
    return { ok: true, manifest: next }
  }
  if (field === "expr") {
    if (typeof value !== "string" || value.trim().length === 0) {
      return { ok: false, reason: "expr must be a non-empty string" }
    }
    delete loop.ref
    loop.expr = value
    return { ok: true, manifest: next }
  }
  if (field === "maxRounds") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1000) {
      return { ok: false, reason: "maxRounds must be an integer from 1 to 1000" }
    }
    loop.maxRounds = value
    return { ok: true, manifest: next }
  }
  if (field === "as" || field === "into") {
    if (typeof value !== "string" || !IDENT.test(value)) {
      return { ok: false, reason: `${field} must be a valid identifier` }
    }
    loop[field] = value
    return { ok: true, manifest: next }
  }
  if (field === "collect") {
    if (typeof value !== "string" || !STATE_REF.test(value)) {
      return { ok: false, reason: "collect must be a state path" }
    }
    loop.collect = value
    return { ok: true, manifest: next }
  }
  if (field === "concurrency") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 32) {
      return { ok: false, reason: "concurrency must be an integer from 1 to 32" }
    }
    loop.concurrency = value
    return { ok: true, manifest: next }
  }
  if (field === "onError") {
    if (value !== "fail" && value !== "continue") {
      return { ok: false, reason: 'onError must be "fail" or "continue"'
      }
    }
    loop.onError = value
    return { ok: true, manifest: next }
  }
  return { ok: false, reason: "Unknown loop field" }
}