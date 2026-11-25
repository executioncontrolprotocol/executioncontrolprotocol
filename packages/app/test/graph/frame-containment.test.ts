import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  boundsAroundNodeIds,
  CONTAINER_PIN_TOLERANCE,
  executionToReactFlow,
  isPinnedToContainerEdge,
  type ReactFlowFrameData,
  type ReactFlowNode,
} from "../../src/graph/index.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const NODE_WIDTH = 260
const NODE_HEIGHT = 160

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith(".ecp.json")) out.push(full)
  }
  return out.sort()
}

const manifests = [
  ...walk(path.join(repoRoot, "examples")),
  ...walk(path.join(repoRoot, "fixtures/manifests/valid")),
  ...walk(path.join(repoRoot, "fixtures/manifests/invalid")).filter((file) => path.basename(file).startsWith("detached")),
]

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function rect(node: ReactFlowNode): Rect {
  const style = (node.style ?? {}) as { width?: number; height?: number }
  return { x: node.position.x, y: node.position.y, w: style.width ?? NODE_WIDTH, h: style.height ?? 160 }
}

const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const inside = (a: Rect, b: Rect): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h

function bandBounds(doc: { nodes: ReactFlowNode[] }, memberIds: readonly string[]): Rect | undefined {
  const bounds = boundsAroundNodeIds(doc.nodes, memberIds, NODE_WIDTH, NODE_HEIGHT)
  if (!bounds) return undefined
  return { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height }
}

describe("frame containment (nested containers lay out without overlap)", () => {
  it("finds the nested pattern examples", () => {
    expect(manifests.some((file) => file.endsWith("nested-parallel.ecp.json"))).toBe(true)
    expect(manifests.some((file) => file.endsWith("nested-foreach-branch.ecp.json"))).toBe(true)
  })

  it.each(manifests.map((file) => [path.relative(repoRoot, file), file]))("%s", (_label, file) => {
    const doc = executionToReactFlow(JSON.parse(readFileSync(file, "utf8")) as ExecutionManifest)
    const byId = new Map(doc.nodes.map((node) => [node.id, node]))
    const frames = doc.nodes.filter((node) => node.type === "ecp-frame")
    const others = doc.nodes.filter((node) => node.type !== "ecp-frame")
    for (const a of frames) {
      for (const b of frames) {
        if (a.id >= b.id) continue
        const A = rect(a)
        const B = rect(b)
        // Two frames either don't touch or one is nested inside the other.
        expect(!intersects(A, B) || inside(A, B) || inside(B, A), `${a.id} overlaps ${b.id}`).toBe(true)
      }
      const frame = a.data as ReactFlowFrameData
      const members = new Set(frame.memberNodeIds ?? [])
      const frameRect = { x: rect(a).x, y: rect(a).y, width: rect(a).w, height: rect(a).h }

      const start = byId.get(frame.startNodeId)
      if (start) {
        expect(isPinnedToContainerEdge(start, frameRect, "left", NODE_WIDTH, CONTAINER_PIN_TOLERANCE)).toBe(true)
      }
      if (frame.endNodeId) {
        const end = byId.get(frame.endNodeId)
        expect(end).toBeDefined()
        if (end) {
          expect(isPinnedToContainerEdge(end, frameRect, "right", NODE_WIDTH, CONTAINER_PIN_TOLERANCE)).toBe(true)
        }
      }

      const bandRects: Rect[] = []
      for (const band of frame.bands) {
        if (band.memberNodeIds.length === 0) continue
        const bounds = bandBounds(doc, band.memberNodeIds)
        expect(bounds, `empty bounds for band ${band.bandId}`).toBeDefined()
        if (!bounds) continue
        bandRects.push(bounds)
        for (const memberId of band.memberNodeIds) {
          const member = byId.get(memberId)
          expect(member, `missing band member ${memberId}`).toBeDefined()
          if (member) expect(inside(rect(member), bounds), `${memberId} outside band ${band.bandId}`).toBe(true)
        }
      }
      for (let i = 0; i < bandRects.length; i++) {
        for (let j = i + 1; j < bandRects.length; j++) {
          const bi = bandRects[i]!
          const bj = bandRects[j]!
          const overlap =
            bi.x < bj.x + bj.w && bj.x < bi.x + bi.w && bi.y < bj.y + bj.h && bj.y < bi.y + bi.h
          expect(overlap, `bands overlap in ${a.id}`).toBe(false)
        }
      }

      const pinIds = new Set([frame.startNodeId, ...(frame.endNodeId ? [frame.endNodeId] : [])])
      for (const node of others) {
        if (pinIds.has(node.id)) continue
        if (members.has(node.id)) expect(inside(rect(node), rect(a)), `${node.id} outside ${a.id}`).toBe(true)
        else expect(intersects(rect(node), rect(a)), `${node.id} intrudes into ${a.id}`).toBe(false)
      }
    }
  })
})