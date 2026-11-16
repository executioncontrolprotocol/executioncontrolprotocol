#!/usr/bin/env node
/**
 * Measure editor schema write at 1,000 synthetic capabilities (S4 / F7).
 *
 * Usage (from repo root, after `pnpm run build`):
 *   node realignment/spikes/schema-scale/measure-editor-1k.mjs [count=1000]
 *
 * Reports write time, root size, and total per-plugin editor bytes.
 * Fallback: if root write > 2 s, the plan says shrink root to uses-completion only.
 */
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const count = Number(process.argv[2] ?? 1000)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const engineUrl = pathToFileURL(path.join(repoRoot, "packages/engine/dist/index.js")).href
const {
  generateEditorRootSchema,
  generatePluginEditorSchema,
  safePluginId,
} = await import(engineUrl)

function fireflySizedAccepts() {
  return {
    type: "object",
    properties: {
      a: { type: "string" },
      b: { type: "integer" },
      c: { type: "string", enum: ["x", "y", "z"] },
      nested: {
        type: "object",
        properties: {
          mid: {
            type: "object",
            properties: {
              leaf: { type: "string" },
              n: { type: "integer" },
            },
          },
          list: { type: "array", items: { type: "string" } },
        },
      },
    },
  }
}

const home = await mkdtemp(path.join(os.tmpdir(), "ecp-editor-1k-"))
const pluginsDir = path.join(home, "schema", "plugins")
await mkdir(pluginsDir, { recursive: true })

const capabilities = []
const pluginDocs = new Map()
for (let i = 0; i < count; i += 1) {
  const pluginId = `@synth/plugin-${i}`
  const capId = `${pluginId}.cap`
  const name = "cap"
  const document = {
    $id: `ecp://plugins/${pluginId}/1.0.0/schema.json`,
    $defs: {
      [`${name}.accepts`]: fireflySizedAccepts(),
      [`${name}.returns`]: { type: "object", properties: { ok: { type: "boolean" } } },
    },
  }
  pluginDocs.set(pluginId, document)
  capabilities.push({
    id: capId,
    plugin: pluginId,
    package: `@synth/plugin-${i}`,
    pluginVersion: "1.0.0",
    summary: `cap ${i}`,
    description: `cap ${i}`,
    useCases: [],
    projections: [],
  })
}

const t0 = performance.now()
let pluginBytes = 0
for (const [pluginId, document] of pluginDocs) {
  const caps = capabilities.filter((c) => c.plugin === pluginId)
  const editor = generatePluginEditorSchema(pluginId, caps, document)
  const text = `${JSON.stringify(editor, null, 2)}\n`
  pluginBytes += Buffer.byteLength(text, "utf8")
  await writeFile(path.join(pluginsDir, `${safePluginId(pluginId)}.editor.schema.json`), text, "utf8")
}
const tPlugins = performance.now()

const root = generateEditorRootSchema(capabilities)
const rootText = `${JSON.stringify(root, null, 2)}\n`
await writeFile(path.join(home, "schema", "execution.schema.json"), rootText, "utf8")
const tRoot = performance.now()

const rootSize = Buffer.byteLength(rootText, "utf8")
const rootWriteMs = tRoot - tPlugins
const totalWriteMs = tRoot - t0
const pluginFiles = (await readdir(pluginsDir)).filter((name) => name.endsWith(".editor.schema.json"))

const report = {
  capabilities: count,
  plugins: pluginDocs.size,
  pluginFiles: pluginFiles.length,
  totalWriteMs: Number(totalWriteMs.toFixed(1)),
  pluginWriteMs: Number((tPlugins - t0).toFixed(1)),
  rootWriteMs: Number(rootWriteMs.toFixed(1)),
  rootBytes: rootSize,
  pluginEditorBytes: pluginBytes,
  home,
  fallbackTriggered: rootWriteMs > 2000,
  note:
    rootWriteMs > 2000
      ? "Root write exceeded 2s — plan fallback is uses-completion-only root (not applied in this spike; apply in product if needed)."
      : "Root write within 2s budget; keep relative $ref dispatch.",
}

console.log(JSON.stringify(report, null, 2))
