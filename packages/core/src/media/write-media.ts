import { FILE_REF_KINDS, type FileRef } from "@executioncontrolprotocol/types"
import { defaultArtifactFilename } from "./artifact-filename.js"
import {
  STORAGE_ARTIFACT_URI_PREFIX,
  type FileCapabilityContext,
} from "./resolve-file.js"

/** Where {@link writeMediaArtifact} parks bytes. @category Media */
export type MediaArtifactStore = "temp" | "durable" | "storage" | "memory"

/** Options for {@link writeMediaArtifact}. @category Media */
export interface WriteMediaArtifactOptions {
  /** MIME type. */
  mediaType: string
  /** Optional filename. */
  name?: string
  /** URI path prefix under the storage tier (default `artifacts/media`). */
  prefix?: string
  /**
   * Storage target:
   * - omit / `"temp"` / `"storage"` — `~/.ecp/temp` via storage (default; wiped on `ecp up`)
   * - `"durable"` — `~/.ecp/artifacts` via storage (survives restarts)
   * - `"memory"` — in-process `ctx.artifacts` only
   */
  store?: MediaArtifactStore
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64")
  }
  const chunk = 0x8000
  let binary = ""
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function resolveTier(
  store: MediaArtifactStore | undefined,
  defaultStore: string | undefined
): "temp" | "durable" | "memory" {
  const explicit = store ?? (defaultStore as MediaArtifactStore | undefined)
  if (explicit === "memory") return "memory"
  if (explicit === "durable") return "durable"
  if (explicit === "temp" || explicit === "storage") return "temp"
  // Default: temp (ephemeral run/demo outputs)
  if (defaultStore === "durable") return "durable"
  if (defaultStore === "memory") return "memory"
  return "temp"
}

function writeToMemory(
  data: Uint8Array,
  uri: string,
  options: WriteMediaArtifactOptions,
  ctx: FileCapabilityContext
): FileRef {
  if (!ctx.artifacts) {
    throw new Error(
      "No artifact store on capability context. Ensure the runtime wires ctx.artifacts (env.ensureArtifactStore)."
    )
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  ctx.artifacts.set(uri, {
    mediaType: options.mediaType,
    name: options.name,
    size: bytes.byteLength,
    bytes,
  })
  return {
    kind: FILE_REF_KINDS.ARTIFACT,
    uri,
    mediaType: options.mediaType,
    name: options.name,
    sizeBytes: data.byteLength,
  }
}

/**
 * Write bytes into temp/durable disk storage (or in-memory artifacts) and return an artifact {@link FileRef}.
 * Default is **temp** via `@executioncontrolprotocol/storage` (`~/.ecp/temp`, wiped on `ecp up`).
 * Use `store: "durable"` for `~/.ecp/artifacts`, or `store: "memory"` for in-process only.
 * @category Media
 */
export async function writeMediaArtifact(
  data: Uint8Array,
  options: WriteMediaArtifactOptions,
  ctx: FileCapabilityContext
): Promise<FileRef> {
  const cfg = ctx.extensionConfig ?? {}
  const storage = (cfg.storage as { outputPrefix?: string; defaultStore?: string } | undefined) ?? {}
  const prefix = options.prefix ?? storage.outputPrefix ?? "artifacts/media"
  const name = options.name ?? defaultArtifactFilename(options.mediaType)
  const key = `${prefix}/${name}`
  const tier = resolveTier(options.store, storage.defaultStore)
  const memoryUri = `ecp://${prefix}/${name}`

  if (tier === "memory") {
    return writeToMemory(data, memoryUri, { ...options, name }, ctx)
  }

  const explicitStorage =
    options.store === "temp" ||
    options.store === "storage" ||
    options.store === "durable" ||
    storage.defaultStore === "storage" ||
    storage.defaultStore === "temp" ||
    storage.defaultStore === "durable"

  try {
    const result = (await ctx.capabilities.call("@executioncontrolprotocol/storage.write", {
      key,
      value: bytesToBase64(data instanceof Uint8Array ? data : new Uint8Array(data)),
      encoding: "base64",
      tier,
      mediaType: options.mediaType,
      name,
    })) as { uri?: string; ok?: boolean }

    if (result?.ok !== true) {
      throw new Error("@executioncontrolprotocol/storage.write did not return ok: true")
    }

    const uri =
      typeof result.uri === "string" && result.uri.length > 0
        ? result.uri
        : `${STORAGE_ARTIFACT_URI_PREFIX}${tier === "durable" ? "artifacts" : "temp"}/${key}`

    // Mirror into in-memory store for same-process GET /v1/artifacts when available.
    if (ctx.artifacts) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
      ctx.artifacts.set(uri, {
        mediaType: options.mediaType,
        name,
        size: bytes.byteLength,
        bytes,
      })
    }

    return {
      kind: FILE_REF_KINDS.ARTIFACT,
      uri,
      mediaType: options.mediaType,
      name,
      sizeBytes: data.byteLength,
    }
  } catch (err) {
    if (explicitStorage) throw err
    // Fallback for tests / hosts without storage bound.
    return writeToMemory(data, memoryUri, { ...options, name }, ctx)
  }
}
