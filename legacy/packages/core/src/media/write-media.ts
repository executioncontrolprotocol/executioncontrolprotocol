import { FILE_REF_KINDS, type FileRef } from "../types/index.js"
import { DEFAULT_MEDIA_PREFIX, FILE_ARTIFACT_URI_PREFIX } from "../services/media-store.js"
import { defaultArtifactFilename } from "./artifact-filename.js"
import {
  mediaStoreContextFrom,
  requireMediaStore,
  type FileCapabilityContext,
} from "./resolve-file.js"

/** Options for {@link writeMediaArtifact}. @category Media */
export interface WriteMediaArtifactOptions {
  /** MIME type. */
  mediaType: string
  /** Optional filename. */
  name?: string
  /** URI path prefix under the store (default {@link DEFAULT_MEDIA_PREFIX}). */
  prefix?: string
}

function outputPrefixFromConfig(cfg: Record<string, unknown>): string | undefined {
  const artifacts = cfg.artifacts as { outputPrefix?: string } | undefined
  return typeof artifacts?.outputPrefix === "string" ? artifacts.outputPrefix : undefined
}

/**
 * Drop a redundant leading `artifacts/` segment so prefixes sit under the
 * artifacts root (`.ecp/artifacts`), not as `.ecp/artifacts/artifacts/…`.
 * @category Media
 */
export function normalizeArtifactPrefix(prefix: string): string {
  const slashNormalized = prefix.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
  if (slashNormalized === "artifacts") return DEFAULT_MEDIA_PREFIX
  if (slashNormalized.startsWith("artifacts/")) {
    const rest = slashNormalized.slice("artifacts/".length)
    return rest.length > 0 ? rest : DEFAULT_MEDIA_PREFIX
  }
  return slashNormalized || DEFAULT_MEDIA_PREFIX
}

/**
 * Sanitize a path segment (run id, step id) for artifact keys.
 * @category Media
 */
export function sanitizeArtifactPathSegment(raw: string): string {
  const trimmed = raw.trim().replace(/["\\\r\n]/g, "")
  const safe = trimmed.replace(/[/\\]/g, "_")
  return safe || "artifact"
}

function splitBasename(name: string): { stem: string; ext: string } {
  const base = name.split(/[/\\]/).pop() ?? name
  const dot = base.lastIndexOf(".")
  if (dot <= 0 || dot === base.length - 1) return { stem: base, ext: "" }
  return { stem: base.slice(0, dot), ext: base.slice(dot) }
}

/**
 * Pick a unique basename under `prefix` when `ctx.artifacts` already holds that URI.
 * @category Media
 */
function uniqueArtifactName(
  prefix: string,
  name: string,
  artifacts: FileCapabilityContext["artifacts"]
): string {
  if (!artifacts) return name
  const { stem, ext } = splitBasename(name)
  let candidate = name
  let n = 2
  for (;;) {
    const uri = `${FILE_ARTIFACT_URI_PREFIX}${prefix}/${candidate}`
    if (!artifacts.get(uri)) return candidate
    candidate = `${stem}-${n}${ext}`
    n += 1
  }
}

/**
 * Scope a normalized prefix with run and step ids when available.
 * Layout: `<runId>/<stepId>/<prefix>`.
 * @category Media
 */
export function scopeArtifactPrefix(
  prefix: string,
  ctx: FileCapabilityContext
): string {
  const normalized = normalizeArtifactPrefix(prefix)
  const runId = typeof ctx.run?.id === "string" ? ctx.run.id.trim() : ""
  const stepId = typeof ctx.step?.id === "string" ? ctx.step.id.trim() : ""
  if (!runId || !stepId) return normalized
  const runSeg = sanitizeArtifactPathSegment(runId)
  const stepSeg = sanitizeArtifactPathSegment(stepId)
  return `${runSeg}/${stepSeg}/${normalized}`
}

/**
 * Write bytes through the bound {@link MediaStore} and return an artifact {@link FileRef}.
 * Prefixes are relative to the artifacts root (a leading `artifacts/` is stripped).
 * When run and step ids are present, keys are scoped as `<runId>/<stepId>/<prefix>/<name>`.
 * @category Media
 */
export async function writeMediaArtifact(
  data: Uint8Array,
  options: WriteMediaArtifactOptions,
  ctx: FileCapabilityContext
): Promise<FileRef> {
  const cfg = ctx.extensionConfig ?? {}
  const rawPrefix = options.prefix ?? outputPrefixFromConfig(cfg) ?? DEFAULT_MEDIA_PREFIX
  const displayName = options.name ?? defaultArtifactFilename(options.mediaType)
  const scopedPrefix = scopeArtifactPrefix(rawPrefix, ctx)
  const name = uniqueArtifactName(scopedPrefix, displayName, ctx.artifacts)
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const store = requireMediaStore(ctx)
  const ref = await store.write(
    bytes,
    { mediaType: options.mediaType, name, prefix: scopedPrefix },
    mediaStoreContextFrom(ctx)
  )

  if (ctx.artifacts && ref.kind === FILE_REF_KINDS.ARTIFACT) {
    ctx.artifacts.set(ref.uri, {
      mediaType: options.mediaType,
      name: displayName,
      size: bytes.byteLength,
      bytes,
    })
  }

  // Prefer the caller's display name on the FileRef; the URI basename may be collision-suffixed.
  if (ref.kind === FILE_REF_KINDS.ARTIFACT && ref.name !== displayName) {
    return { ...ref, name: displayName }
  }

  return ref
}
