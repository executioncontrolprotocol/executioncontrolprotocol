import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { executionToReactFlow, extractDataEdges, walkManifestPlacements } from "../../src/graph/index.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const validDir = path.resolve(here, "../../../../fixtures/manifests/valid")
const examplesDir = path.resolve(here, "../../../../examples")
const validNames = readdirSync(validDir).filter((name) => name.endsWith(".ecp.json")).sort()

function listExampleEcpFiles(dir: string, prefix = ""): string[] {
  const names = readdirSync(dir).sort()
  const out: string[] = []
  for (const name of names) {
    const rel = prefix ? `${prefix}/${name}` : name
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listExampleEcpFiles(full, rel))
    else if (name.endsWith(".ecp.json")) out.push(rel)
  }
  return out
}

const exampleNames = listExampleEcpFiles(examplesDir)

function loadValid(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(validDir, name), "utf8")) as ExecutionManifest
}

function loadExample(rel: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(examplesDir, rel), "utf8")) as ExecutionManifest
}

describe("executionToReactFlow fixture sweep", () => {
  it.each(validNames)("valid %s encodes data branches only", (name) => {
    const doc = executionToReactFlow(loadValid(name))
    expect(doc.nodes.length).toBeGreaterThan(0)
    expect(doc.edges.every((edge) => edge.data.kind === "data")).toBe(true)
    const walked = walkManifestPlacements(loadValid(name).steps ?? [])
    expect(walked.placements.length).toBeGreaterThan(0)
    const edges = extractDataEdges(loadValid(name).steps ?? [], new Set())
    expect(edges.length).toBeGreaterThanOrEqual(0)
  })

  it.each(exampleNames)("example %s encodes data branches only", (rel) => {
    const manifest = loadExample(rel)
    const doc = executionToReactFlow(manifest)
    expect(doc.nodes.length).toBeGreaterThan(0)
    expect(doc.edges.every((edge) => edge.data.kind === "data")).toBe(true)
    walkManifestPlacements(manifest.steps ?? [])
    extractDataEdges(manifest.steps ?? [], new Set())
  })
})