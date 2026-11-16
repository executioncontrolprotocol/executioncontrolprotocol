import { readFile, rm, stat } from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import type { Host } from "@executioncontrolprotocol/engine"
import { atomicWriteText } from "@executioncontrolprotocol/local"
import { PluginAdapter } from "@executioncontrolprotocol/protocol"
import baseSchema from "@executioncontrolprotocol/protocol/schemas/execution.base.schema.json" with { type: "json" }

/**
 * Result of writing editor schema files.
 * @category Host
 */
export interface EditorSchemaWriteResult {
  /** Milliseconds spent in the write path (including skipped warm starts). */
  ms: number
}

/**
 * Stamp under `$ECP_HOME/schema/plugins/index.json` for lazy editor rewrites.
 * @category Host
 */
export interface EditorSchemaStamp {
  /** Runtime/editor schemaHash (base + sorted plugin schema hashes). */
  schemaHash: string
  /** Sorted capability ids reflected in the root editor schema. */
  capabilityIds: string[]
  /** Plugin id → `ecp.schema.json` hash from the light manifest. */
  plugins: Record<string, string>
}

/** Max wait for an in-flight editor write during host shutdown. */
export const EDITOR_SCHEMA_SHUTDOWN_WAIT_MS = 60_000

/** Test-only delay applied before finishing a write. */
let writeDelayMsForTests = 0

/** Test-only gate: blocks {@link writeEditorSchemaFiles} until released. */
let writeGatePromise: Promise<void> | undefined

/** Test-only release for the write gate. */
let writeGateResolve: (() => void) | undefined

/**
 * Inject artificial write latency in unit tests.
 * @category Host
 */
export function setEditorSchemaWriteDelayForTests(ms: number): void {
  writeDelayMsForTests = Math.max(0, ms)
}

/**
 * Hold the async editor schema write until {@link releaseEditorSchemaWriteForTests}.
 * @category Host
 */
export function holdEditorSchemaWriteForTests(): void {
  writeGatePromise = new Promise<void>((resolve) => {
    writeGateResolve = resolve
  })
}

/**
 * Release a held editor schema write (no-op when not held).
 * @category Host
 */
export function releaseEditorSchemaWriteForTests(): void {
  writeGateResolve?.()
  writeGateResolve = undefined
  writeGatePromise = undefined
}

/**
 * Compute the stable editor schema hash (base JSON + sorted plugin fingerprints).
 * @category Host
 */
export async function computeEditorSchemaHash(host: Host): Promise<string> {
  const { canonicalJson, sha256Hex } = await import("@executioncontrolprotocol/engine")
  const plugins = host.services.get(PluginAdapter)
  const fingerprints = plugins.schemaFingerprints()
  const base = structuredClone(baseSchema) as Record<string, unknown>
  base.$id = "ecp://host/execution.schema.json"
  return sha256Hex(
    canonicalJson({
      base,
      plugins: [...fingerprints]
        .map((item) => ({ id: item.pluginId, version: item.version, hash: item.hash }))
        .sort((left, right) => {
          if (left.id !== right.id) return left.id < right.id ? -1 : 1
          if (left.version !== right.version) return left.version < right.version ? -1 : 1
          return left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0
        }),
    }),
  )
}

/**
 * Write or refresh the root editor schema and per-plugin editor files.
 * A warm start with an unchanged plugin set does not call `loadPluginSchema`.
 * @category Host
 */
export async function writeEditorSchemaFiles(
  host: Host,
  options?: { onError?: (error: unknown) => void },
): Promise<EditorSchemaWriteResult> {
  const started = Date.now()
  try {
    const {
      generateEditorRootSchema,
      generatePluginEditorSchema,
      safePluginId,
    } = await import("@executioncontrolprotocol/engine")
    const plugins = host.services.get(PluginAdapter)
    const light = plugins.capabilities()
    const fingerprints = plugins.schemaFingerprints()
    const fingerprintById = new Map(fingerprints.map((item) => [item.pluginId, item]))
    const capabilityIds = [...new Set(light.map((entry) => entry.id))].sort()
    const pluginIds = [...new Set(light.map((entry) => entry.plugin))].sort()

    const schemaDir = path.join(host.settings.home, "schema")
    const pluginsDir = path.join(schemaDir, "plugins")
    const rootPath = path.join(schemaDir, "execution.schema.json")
    const indexPath = path.join(pluginsDir, "index.json")

    const desiredPlugins: Record<string, string> = {}
    for (const pluginId of pluginIds) {
      const fingerprint = fingerprintById.get(pluginId)
      if (fingerprint) desiredPlugins[pluginId] = fingerprint.hash
    }

    const schemaHash = await computeEditorSchemaHash(host)

    const previous = await readStamp(indexPath)
    const stampMatches =
      previous !== undefined &&
      previous.schemaHash === schemaHash &&
      arraysEqual(previous.capabilityIds, capabilityIds) &&
      recordsEqual(previous.plugins, desiredPlugins)

    let rootOk = false
    try {
      await stat(rootPath)
      rootOk = true
    } catch {
      rootOk = false
    }

    const missingPluginFiles: string[] = []
    for (const pluginId of pluginIds) {
      const target = path.join(pluginsDir, `${safePluginId(pluginId)}.editor.schema.json`)
      try {
        await stat(target)
      } catch {
        missingPluginFiles.push(pluginId)
      }
    }

    if (stampMatches && rootOk && missingPluginFiles.length === 0) {
      return { ms: Date.now() - started }
    }

    if (writeGatePromise) {
      await writeGatePromise
    }

    if (writeDelayMsForTests > 0) {
      await delay(writeDelayMsForTests)
    }

    const changedPluginIds = new Set<string>(missingPluginFiles)
    for (const pluginId of pluginIds) {
      if (previous?.plugins[pluginId] !== desiredPlugins[pluginId]) changedPluginIds.add(pluginId)
    }
    for (const pluginId of Object.keys(previous?.plugins ?? {})) {
      if (!(pluginId in desiredPlugins)) {
        const stale = path.join(pluginsDir, `${safePluginId(pluginId)}.editor.schema.json`)
        await rm(stale, { force: true })
      }
    }

    for (const pluginId of changedPluginIds) {
      const document = await plugins.loadPluginSchema(pluginId)
      if (!document) continue
      const pluginCaps = light.filter((entry) => entry.plugin === pluginId)
      const editor = generatePluginEditorSchema(pluginId, pluginCaps, document)
      const target = path.join(pluginsDir, `${safePluginId(pluginId)}.editor.schema.json`)
      await atomicWriteText(target, `${JSON.stringify(editor, null, 2)}\n`)
    }

    const rootNeeded =
      !rootOk ||
      !previous ||
      previous.schemaHash !== schemaHash ||
      !arraysEqual(previous.capabilityIds, capabilityIds) ||
      changedPluginIds.size > 0
    if (rootNeeded) {
      const root = generateEditorRootSchema(light)
      await atomicWriteText(rootPath, `${JSON.stringify(root, null, 2)}\n`)
    }

    const stamp: EditorSchemaStamp = {
      schemaHash,
      capabilityIds,
      plugins: desiredPlugins,
    }
    await atomicWriteText(indexPath, `${JSON.stringify(stamp, null, 2)}\n`)
    return { ms: Date.now() - started }
  } catch (error) {
    options?.onError?.(error)
    return { ms: Date.now() - started }
  }
}

async function readStamp(indexPath: string): Promise<EditorSchemaStamp | undefined> {
  try {
    const text = await readFile(indexPath, "utf8")
    const parsed = JSON.parse(text) as EditorSchemaStamp
    if (
      typeof parsed.schemaHash !== "string" ||
      !Array.isArray(parsed.capabilityIds) ||
      typeof parsed.plugins !== "object" ||
      parsed.plugins === null
    ) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function recordsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (!arraysEqual(leftKeys, rightKeys)) return false
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false
  }
  return true
}