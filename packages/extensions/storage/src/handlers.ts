import type { CapabilityHandler } from "@executioncontrolprotocol/core"
import {
  ensureEcpHomeLayout,
  readStorageFile,
  resolveEcpHome,
  writeStorageFile,
  type StorageTier,
} from "./home.js"
import { parseStorageKey, storageUri } from "./uri.js"
import {
  storageReadInputSchema,
  storageReadOutputSchema,
  storageWriteInputSchema,
  storageWriteOutputSchema,
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
}

function readConfig(ctx: unknown): StorageExtensionConfig {
  const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
  return {
    home: typeof cfg.home === "string" ? cfg.home : undefined,
    prefix: typeof cfg.prefix === "string" ? cfg.prefix : undefined,
    tempRoot: typeof cfg.tempRoot === "string" ? cfg.tempRoot : undefined,
    artifactsRoot: typeof cfg.artifactsRoot === "string" ? cfg.artifactsRoot : undefined,
  }
}

async function resolveTier(cfg: StorageExtensionConfig): Promise<{
  temp: string
  durable: string
}> {
  const layout = await ensureEcpHomeLayout(cfg.home ?? resolveEcpHome())
  return {
    temp: cfg.tempRoot ?? layout.temp,
    durable: cfg.artifactsRoot ?? layout.artifacts,
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

/** Disk-backed write handler. @category Storage */
export const handleStorageWrite: CapabilityHandler = async (input, ctx) => {
  const parsed = storageWriteInputSchema.parse(input)
  const cfg = readConfig(ctx)
  const roots = await resolveTier(cfg)
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
  const roots = await resolveTier(cfg)
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
