import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { executionToReactFlow, type ReactFlowFrameData, type ReactFlowNode } from "../../src/graph/index.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")

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
  return { x: node.position.x, y: node.position.y, w: style.width ?? 260, h: style.height ?? 160 }
}

const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const inside = (a: Rect, b: Rect): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h

describe("frame containment (nested containers lay out without overlap)", () => {
  it("finds the nested pattern examples", () => {
    expect(manifests.some((file) => file.endsWith("nested-parallel.ecp.json"))).toBe(true)
    expect(manifests.some((file) => file.endsWith("nested-foreach-branch.ecp.json"))).toBe(true)
  })

  it.each(manifests.map((file) => [path.relative(repoRoot, file), file]))("%s", (_label, file) => {
    const doc = executionToReactFlow(JSON.parse(readFileSync(file, "utf8")) as ExecutionManifest)
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
      const members = new Set((a.data as ReactFlowFrameData & { memberNodeIds?: string[] }).memberNodeIds ?? [])
      for (const node of others) {
        if (members.has(node.id)) expect(inside(rect(node), rect(a)), `${node.id} outside ${a.id}`).toBe(true)
        else expect(intersects(rect(node), rect(a)), `${node.id} intrudes into ${a.id}`).toBe(false)
      }
    }
  })
})
