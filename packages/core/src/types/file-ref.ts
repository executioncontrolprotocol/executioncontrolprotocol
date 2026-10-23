import { z } from "zod"

/** Portable file reference kinds. @category File */
export const FILE_REF_KINDS = {
  ARTIFACT: "artifact",
  FILE: "file",
  URL: "url",
  BUFFER: "buffer",
} as const

/** File reference kind union. @category File */
export type FileRefKind = (typeof FILE_REF_KINDS)[keyof typeof FILE_REF_KINDS]

/** Artifact-backed file reference. @category File */
export interface ArtifactFileRef {
  /** Reference kind. */
  kind: typeof FILE_REF_KINDS.ARTIFACT
  /**
   * Artifact URI (`ecp://…` in `ctx.artifacts`, `ecp://storage/…`, or
   * `ecp://browser/…` when bytes live in `ctx.blobs`).
   */
  uri: string
  /** Optional MIME type. */
  mediaType?: string
  /** Optional display name. */
  name?: string
  /** Optional byte size when known. */
  sizeBytes?: number
}

/** Filesystem or browser-locator file reference. @category File */
export interface FileFileRef {
  /** Reference kind. */
  kind: typeof FILE_REF_KINDS.FILE
  /**
   * Absolute or relative file path on Node, or an `ecp://browser/<id>` locator
   * stashed in `ctx.blobs` for browser/mixed hops.
   */
  path: string
  /** Optional MIME type. */
  mediaType?: string
  /** Optional byte size when known. */
  sizeBytes?: number
}

/** Remote URL file reference. @category File */
export interface UrlFileRef {
  /** Reference kind. */
  kind: typeof FILE_REF_KINDS.URL
  /** File URL. */
  url: string
  /** Optional request headers. */
  headers?: Record<string, string>
  /** Optional MIME type. */
  mediaType?: string
}

/** In-memory buffer file reference (runtime/tests; not manifest-portable). @category File */
export interface BufferFileRef {
  /** Reference kind. */
  kind: typeof FILE_REF_KINDS.BUFFER
  /** Base64-encoded file bytes. */
  data: string
  /** Optional MIME type. */
  mediaType?: string
}

/** Portable file reference for workflow steps. @category File */
export type FileRef = ArtifactFileRef | FileFileRef | UrlFileRef | BufferFileRef

/** Options carried on {@link fileRefSchema} instances for UI and validation hints. @category File */
export interface FileRefSchemaOptions {
  /** Expected MIME type or wildcard (e.g. `image/*`). */
  contentMediaType?: string | string[]
}

const baseFileRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(FILE_REF_KINDS.ARTIFACT),
    uri: z.string(),
    mediaType: z.string().optional(),
    name: z.string().optional(),
    sizeBytes: z.number().optional(),
  }),
  z.object({
    kind: z.literal(FILE_REF_KINDS.FILE),
    path: z.string(),
    mediaType: z.string().optional(),
    sizeBytes: z.number().optional(),
  }),
  z.object({
    kind: z.literal(FILE_REF_KINDS.URL),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    mediaType: z.string().optional(),
  }),
  z.object({
    kind: z.literal(FILE_REF_KINDS.BUFFER),
    data: z.string(),
    mediaType: z.string().optional(),
  }),
])

const fileRefSchemaMeta = new WeakMap<z.ZodType, FileRefSchemaOptions>()

function unwrapZodType(type: z.ZodType): z.ZodType {
  if (type instanceof z.ZodOptional) {
    return unwrapZodType(type.unwrap() as z.ZodType)
  }
  if (type instanceof z.ZodDefault) {
    return unwrapZodType(type.removeDefault() as z.ZodType)
  }
  if (type instanceof z.ZodNullable) {
    return unwrapZodType(type.unwrap() as z.ZodType)
  }
  return type
}

function fileRefSchemaChain(type: z.ZodType): z.ZodType[] {
  const chain: z.ZodType[] = []
  let current: z.ZodType = unwrapZodType(type)
  for (;;) {
    chain.push(current)
    if (current instanceof z.ZodEffects) {
      current = current._def.schema as z.ZodType
      continue
    }
    break
  }
  return chain
}

/**
 * Canonical portable JSON Schema hint for file-ref ports and workflow I/O.
 * @category File
 */
export function fileRefValueSchemaHint(options?: FileRefSchemaOptions): Record<string, unknown> {
  const hint: Record<string, unknown> = {
    "x-ecp-file": true,
    type: "object",
    properties: {
      kind: { type: "string", enum: Object.values(FILE_REF_KINDS) },
      path: { type: "string" },
      uri: { type: "string" },
      url: { type: "string" },
      data: { type: "string" },
      mediaType: { type: "string" },
      sizeBytes: { type: "number" },
      name: { type: "string" },
      headers: { type: "object" },
    },
  }
  if (options?.contentMediaType !== undefined) {
    hint.contentMediaType = options.contentMediaType
  }
  return hint
}

/**
 * Zod schema for {@link FileRef} with optional {@link FileRefSchemaOptions} metadata.
 * @category File
 */
export function fileRefSchema(options?: FileRefSchemaOptions): z.ZodType<FileRef> {
  if (options?.contentMediaType === undefined) {
    return baseFileRefSchema
  }
  const schema = baseFileRefSchema.superRefine(() => undefined)
  fileRefSchemaMeta.set(schema, options)
  return schema
}

/** Detect optional/nullable wrappers; true for {@link fileRefSchema} instances. @category File */
export function isFileRefSchema(type: z.ZodType): boolean {
  return fileRefSchemaChain(type).some(
    (node) => node === baseFileRefSchema || fileRefSchemaMeta.has(node)
  )
}

/** Read contentMediaType hint from a {@link fileRefSchema} (after unwrap). @category File */
export function fileRefSchemaOptions(type: z.ZodType): FileRefSchemaOptions | undefined {
  for (const node of fileRefSchemaChain(type)) {
    const meta = fileRefSchemaMeta.get(node)
    if (meta?.contentMediaType !== undefined) {
      return meta
    }
  }
  return isFileRefSchema(type) ? {} : undefined
}

/** @category File */
export function isFileRefKind(value: unknown): value is FileRefKind {
  return (
    typeof value === "string" &&
    (Object.values(FILE_REF_KINDS) as string[]).includes(value)
  )
}
