import { stat } from "node:fs/promises"
import type { CapabilityHandler } from "@executioncontrolprotocol/core"
import {
  deleteStorageFile,
  ensureEcpHomeLayout,
  listStorageKeys,
  readStorageFile,
  resolveEcpHome,
  resolveSafeStoragePath,
  writeStorageFile,
  type StorageTier,
} from "./home.js"
import { parseStorageKey, storageUri } from "./uri.js"
import {
  storageReadInputSchema,
  storageReadOutputSchema,
  storageWriteInputSchema,
  storageWriteOutputSchema,
  WORKFLOW_FLUENT_SUFFIX,
  workflowBundleSchema,
  workflowDeleteInputSchema,
  workflowDeleteOutputSchema,
  workflowListInputSchema,
  workflowListOutputSchema,
  workflowLoadInputSchema,
  workflowLoadOutputSchema,
  workflowSaveInputSchema,
  workflowSaveOutputSchema,
} from "./schemas.js"

/** Config shape for the storage extension. @category Storage */
export interface StorageExtensionConfig {
  /** Override ECP home (`~/.ecp`). */
  home?: string
  /** Optional key prefix applied before the logical key. */
  prefix?: string
  /** Override temp root (defaults to `<home>/temp`). */
  tempRoot?: string
  /** Override durable root (defaults to `<home>/artifacts`). */
  artifactsRoot?: string
  /** Override workflows root (defaults to `<home>/workflows`). */
  workflowsRoot?: string
}

/**
 * Sanitize a workflow id to a safe filename stem (no path separators / `..`).
 * @category Storage
 */
export function sanitizeWorkflowId(id: string): string {
  const trimmed = id.trim().replace(/\\/g, "/")
  if (!trimmed) throw new Error("Workflow id must be non-empty")
  if (trimmed.includes("/") || trimmed.includes("..")) {
    throw new Error(`Workflow id must not contain path segments: ${id}`)
  }
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  if (!safe) throw new Error(`Workflow id is empty after sanitize: ${id}`)
  return safe
}

/**
 * Fluent host library filename for a workflow id.
 * @category Storage
 */
export function workflowFluentFileKey(id: string): string {
  const safe = sanitizeWorkflowId(id)
  return safe.endsWith(WORKFLOW_FLUENT_SUFFIX) ? safe : `${safe}${WORKFLOW_FLUENT_SUFFIX}`
}

/**
 * Legacy dual-bundle JSON filename for a workflow id.
 * @category Storage
 */
export function workflowLegacyBundleFileKey(id: string): string {
  const safe = sanitizeWorkflowId(id)
  return safe.endsWith(".json") ? safe : `${safe}.json`
}

/**
 * Strip Fluent or legacy suffix to recover the workflow id stem.
 * @category Storage
 */
export function workflowIdFromFileKey(key: string): string {
  const base = key.replace(/\\/g, "/").split("/").pop() ?? key
  if (base.endsWith(WORKFLOW_FLUENT_SUFFIX)) {
    return base.slice(0, -WORKFLOW_FLUENT_SUFFIX.length)
  }
  if (base.endsWith(".json")) {
    return base.slice(0, -".json".length)
  }
  return base
}

function readConfig(ctx: unknown): StorageExtensionConfig {
  const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
  return {
    home: typeof cfg.home === "string" ? cfg.home : undefined,
    prefix: typeof cfg.prefix === "string" ? cfg.prefix : undefined,
    tempRoot: typeof cfg.tempRoot === "string" ? cfg.tempRoot : undefined,
    artifactsRoot: typeof cfg.artifactsRoot === "string" ? cfg.artifactsRoot : undefined,
    workflowsRoot: typeof cfg.workflowsRoot === "string" ? cfg.workflowsRoot : undefined,
  }
}

async function resolveRoots(cfg: StorageExtensionConfig): Promise<{
  temp: string
  durable: string
  workflows: string
}> {
  const layout = await ensureEcpHomeLayout(cfg.home ?? resolveEcpHome())
  return {
    temp: cfg.tempRoot ?? layout.temp,
    durable: cfg.artifactsRoot ?? layout.artifacts,
    workflows: cfg.workflowsRoot ?? layout.workflows,
  }
}

function tierRoot(roots: { temp: string; durable: string }, tier: StorageTier): string {
  return tier === "durable" ? roots.durable : roots.temp
}

function applyPrefix(prefix: string | undefined, key: string): string {
  if (!prefix) return key
  const p = prefix.replace(/\\/g, "/").replace(/\/+$/, "")
  const k = key.replace(/^\/+/, "")
  return p ? `${p}/${k}` : k
}

async function fileUpdatedAt(workflowsRoot: string, key: string): Promise<string> {
  const path = resolveSafeStoragePath(workflowsRoot, key)
  try {
    const info = await stat(path)
    return info.mtime.toISOString()
  } catch {
    return new Date(0).toISOString()
  }
}

/** Disk-backed write handler. @category Storage */
export const handleStorageWrite: CapabilityHandler = async (input, ctx) => {
  const parsed = storageWriteInputSchema.parse(input)
  const cfg = readConfig(ctx)
  const roots = await resolveRoots(cfg)
  const key = applyPrefix(cfg.prefix, parsed.key)
  const tier = parsed.tier
  await writeStorageFile(tierRoot(roots, tier), key, parsed.value, {
    encoding: parsed.encoding,
    mediaType: parsed.mediaType,
    name: parsed.name,
  })
  const uri = storageUri(tier, key)
  return storageWriteOutputSchema.parse({ ok: true, uri, tier })
}

/** Disk-backed read handler. @category Storage */
export const handleStorageRead: CapabilityHandler = async (input, ctx) => {
  const parsed = storageReadInputSchema.parse(input)
  const cfg = readConfig(ctx)
  const roots = await resolveRoots(cfg)
  const { tier, key: rawKey } = parseStorageKey(parsed.key, parsed.tier)
  const key = applyPrefix(cfg.prefix, rawKey)
  const found = await readStorageFile(tierRoot(roots, tier), key)
  if (!found) {
    return storageReadOutputSchema.parse({})
  }
  return storageReadOutputSchema.parse({
    value: found.value,
    mediaType: found.sidecar?.mediaType,
    name: found.sidecar?.name,
    tier,
    uri: storageUri(tier, key),
  })
}

/** Save Fluent workflow source under `~/.ecp/workflows`. @category Storage */
export const handleWorkflowSave: CapabilityHandler = async (input, ctx) => {
  const parsed = workflowSaveInputSchema.parse(input)
  const cfg = readConfig(ctx)
  const roots = await resolveRoots(cfg)
  const id = sanitizeWorkflowId(parsed.id)
  const label = (parsed.label?.trim() || id).trim()
  const key = workflowFluentFileKey(id)
  await writeStorageFile(roots.workflows, key, parsed.fluent, {
    encoding: "utf8",
    mediaType: "text/typescript",
    name: label,
  })
  // Prefer Fluent; remove legacy dual-bundle file for the same id.
  await deleteStorageFile(roots.workflows, workflowLegacyBundleFileKey(id))
  const path = resolveSafeStoragePath(roots.workflows, key)
  return workflowSaveOutputSchema.parse({ ok: true, id, path })
}

function coerceJsonValue(value: unknown): unknown {
  if (typeof value === "object" && value !== null) return value
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return undefined
    }
  }
  if (value instanceof Uint8Array) {
    try {
      return JSON.parse(Buffer.from(value).toString("utf8")) as unknown
    } catch {
      return undefined
    }
  }
  return undefined
}

function coerceFluentText(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8")
  return undefined
}

/** List saved workflows (Fluent preferred; legacy JSON still listed). @category Storage */
export const handleWorkflowList: CapabilityHandler = async (input, ctx) => {
  workflowListInputSchema.parse(input ?? {})
  const cfg = readConfig(ctx)
  const roots = await resolveRoots(cfg)
  const keys = await listStorageKeys(roots.workflows)
  const byId = new Map<string, { id: string; label: string; updatedAt: string; preferFluent: boolean }>()

  for (const key of keys) {
    if (key.endsWith(WORKFLOW_FLUENT_SUFFIX)) {
      const id = workflowIdFromFileKey(key)
      const found = await readStorageFile(roots.workflows, key)
      const label =
        (found?.sidecar?.name && found.sidecar.name.trim()) || id
      const updatedAt = await fileUpdatedAt(roots.workflows, key)
      byId.set(id, { id, label, updatedAt, preferFluent: true })
      continue
    }
    if (!key.endsWith(".json")) continue
    const id = workflowIdFromFileKey(key)
    if (byId.get(id)?.preferFluent) continue
    const found = await readStorageFile(roots.workflows, key)
    if (!found) continue
    const parsed = workflowBundleSchema.safeParse(coerceJsonValue(found.value))
    if (!parsed.success) continue
    byId.set(id, {
      id: parsed.data.id,
      label: parsed.data.label,
      updatedAt: parsed.data.updatedAt,
      preferFluent: false,
    })
  }

  const workflows = [...byId.values()]
    .map(({ id, label, updatedAt }) => ({ id, label, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return workflowListOutputSchema.parse({ workflows })
}

/** Load one workflow by id (Fluent file, else legacy bundle). @category Storage */
export const handleWorkflowLoad: CapabilityHandler = async (input, ctx) => {
  const parsed = workflowLoadInputSchema.parse(input)
  const cfg = readConfig(ctx)
  const roots = await resolveRoots(cfg)
  const id = sanitizeWorkflowId(parsed.id)

  const fluentKey = workflowFluentFileKey(id)
  const fluentFound = await readStorageFile(roots.workflows, fluentKey)
  const fluentText = fluentFound ? coerceFluentText(fluentFound.value) : undefined
  if (fluentText !== undefined) {
    const label = (fluentFound?.sidecar?.name && fluentFound.sidecar.name.trim()) || id
    const updatedAt = await fileUpdatedAt(roots.workflows, fluentKey)
    return workflowLoadOutputSchema.parse({
      id,
      label,
      updatedAt,
      fluent: fluentText,
    })
  }

  const legacyKey = workflowLegacyBundleFileKey(id)
  const legacyFound = await readStorageFile(roots.workflows, legacyKey)
  if (!legacyFound) {
    return workflowLoadOutputSchema.parse({})
  }
  const bundle = workflowBundleSchema.parse(coerceJsonValue(legacyFound.value))
  return workflowLoadOutputSchema.parse({
    id: bundle.id,
    label: bundle.label,
    updatedAt: bundle.updatedAt,
    fluent: bundle.fluent,
  })
}

/** Delete one workflow by id (Fluent and/or legacy). @category Storage */
export const handleWorkflowDelete: CapabilityHandler = async (input, ctx) => {
  const parsed = workflowDeleteInputSchema.parse(input)
  const cfg = readConfig(ctx)
  const roots = await resolveRoots(cfg)
  const id = sanitizeWorkflowId(parsed.id)
  const deletedFluent = await deleteStorageFile(roots.workflows, workflowFluentFileKey(id))
  const deletedLegacy = await deleteStorageFile(roots.workflows, workflowLegacyBundleFileKey(id))
  return workflowDeleteOutputSchema.parse({
    ok: true,
    deleted: deletedFluent || deletedLegacy,
  })
}
