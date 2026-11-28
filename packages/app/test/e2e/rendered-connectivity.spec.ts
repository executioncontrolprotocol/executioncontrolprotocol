import { copyFileSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { CapabilityEntry, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { expect, test, type Page } from "@playwright/test"
import { AppHostClient } from "../../src/client/api.js"
import { retrieveItem, retrieveItems } from "../../src/client/results.js"
import { executionToReactFlow, type ReactFlowDocument } from "../../src/graph/index.js"
import { manifestCapabilityUses, mergeCapabilityCatalog } from "../../src/web/hooks/useCapabilities.js"
import { appUrl, startAppHarness, type AppE2eHarness } from "./support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const validDir = path.join(repoRoot, "fixtures/manifests/valid")
const invalidDir = path.join(repoRoot, "fixtures/manifests/invalid")
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

const manifestSources = [
  ...listEcpJson(validDir),
  ...listEcpJson(invalidDir).filter((file) => path.basename(file).startsWith("detached")),
  ...walkExamples(examplesDir),
]

/** Source path -> copied path in the harness work dir (unique basename). */
const manifestInHarness = new Map<string, string>()

function loadManifest(file: string): ExecutionManifest {
  return JSON.parse(readFileSync(file, "utf8")) as ExecutionManifest
}

async function encodeLikeWorkspace(harness: AppE2eHarness, manifest: ExecutionManifest): Promise<ReactFlowDocument> {
  const client = new AppHostClient(harness.baseUrl, harness.token)
  const listResponse = await client.retrieve({ type: "capability", limit: 100 })
  const listEntries = retrieveItems<CapabilityEntry>(listResponse).filter((entry) => typeof entry.id === "string")
  const manifestUses = manifestCapabilityUses(manifest)
  const fullById: Record<string, CapabilityEntry> = {}
  await Promise.all(
    manifestUses.map(async (id) => {
      try {
        const entry = retrieveItem<CapabilityEntry>(await client.retrieve({ type: "capability", id }))
        if (entry) fullById[id] = entry
      } catch {
        /* capability not installed; encode without its schema */
      }
    }),
  )
  const { schemas } = mergeCapabilityCatalog(listEntries, fullById, manifestUses)
  return executionToReactFlow(manifest, { capabilitySchemas: schemas })
}

function attachReactFlow008Guard(page: Page): string[] {
  const rf008: string[] = []
  page.on("console", (msg) => {
    const text = msg.text()
    if (/008|Couldn't create edge/.test(text)) rf008.push(text)
  })
  return rf008
}

test.describe("Rendered connectivity", () => {
  test.describe.configure({ mode: "serial" })

  let harness: AppE2eHarness

  test.beforeAll(async () => {
    harness = await startAppHarness()
    const usedNames = new Set<string>()
    for (const source of manifestSources) {
      let base = path.basename(source)
      if (usedNames.has(base)) {
        const parent = path.basename(path.dirname(source))
        base = `${parent}-${base}`
      }
      usedNames.add(base)
      const dest = path.join(harness.workDir, base)
      copyFileSync(source, dest)
      manifestInHarness.set(source, dest)
    }
  })

  test.afterAll(async () => {
    await harness.stop()
  })

  async function openWorkspace(page: Page, manifestPath: string): Promise<void> {
    await page.goto(appUrl(harness.baseUrl, harness.token, { open: manifestPath, dir: harness.workDir }))
    await expect(page.getByTestId("workspace")).toBeVisible({ timeout: 25_000 })
  }

  for (const source of manifestSources) {
    const label = path.relative(repoRoot, source)

    test(label, async ({ page }) => {
      const manifestPath = manifestInHarness.get(source)
      if (!manifestPath) throw new Error(`${label}: not copied into harness`)

      const rf008 = attachReactFlow008Guard(page)
      const manifest = loadManifest(manifestPath)
      const doc = await encodeLikeWorkspace(harness, manifest)
      const published = doc.edges.filter((edge) => edge.data.kind === "data")
      const expectedIds = new Set(published.map((edge) => edge.id))

      await openWorkspace(page, manifestPath)

      expect(rf008, `React Flow 008 for ${label}`).toEqual([])

      await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 15_000 })
      const rendered = page.locator(".react-flow__edge")
      await expect(rendered).toHaveCount(expectedIds.size, { timeout: 15_000 })
      const renderedIds = await rendered.evaluateAll((nodes) =>
        nodes.map((el) => el.getAttribute("data-id") ?? "").filter(Boolean),
      )
      expect(renderedIds.length, `${label} edge count`).toBe(expectedIds.size)

      const renderedIdSet = new Set(renderedIds)
      for (const id of expectedIds) {
        expect(renderedIdSet.has(id), `${label} missing rendered edge ${id}`).toBe(true)
      }

      for (const edge of published) {
        if (!renderedIdSet.has(edge.id)) continue
        expect(
          doc.nodes.some((node) => node.id === edge.source),
          `${label} unknown data edge source ${edge.source}`,
        ).toBe(true)
        expect(
          doc.nodes.some((node) => node.id === edge.target),
          `${label} unknown data edge target ${edge.target}`,
        ).toBe(true)
      }
    })
  }
})