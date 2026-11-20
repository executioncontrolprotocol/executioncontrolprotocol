/**
 * Product-shaped capability accepts and returns for Adobe Firefly Services (D6).
 * Called from generate.mjs after {@link resolveOutputForOperation}.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { ASYNC_FINAL_OUTPUT_BY_OP } from "./operation-class.mjs"

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "../..")

/** Zod expression imported as `fileRefSchema` from ../../schemas.js in generated capabilities. */
export const USES_FILE_REF_IMPORT = "fileRefSchema"

/** Photoshop multi-output token map (RFC media type → state key). */
export const MEDIA_TYPE_TOKEN = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/webp": "webp",
  "image/vnd.adobe.photoshop": "psd",
  "application/pdf": "pdf",
}

/**
 * @param {string} mediaType
 */
export function mediaTypeToken(mediaType) {
  const known = MEDIA_TYPE_TOKEN[mediaType?.toLowerCase()]
  if (known) return known
  const slash = mediaType?.indexOf("/") ?? -1
  if (slash < 0) return "file"
  const sub = mediaType.slice(slash + 1).replace(/[^a-zA-Z0-9_-]+/g, "-")
  return sub || "file"
}

/**
 * @typedef {'image-job' | 'video-job' | 'upscaler' | 'photoshop-multi' | 'manifest' | 'url-blob' | 'passthrough'} ProductShapeKind
 */

/**
 * @param {string} opName
 * @param {{ schema?: object, defaultManifestOutputs?: boolean, unknownFinal?: boolean }} resolved
 * @returns {ProductShapeKind}
 */
export function classifyProductShape(opName, resolved) {
  const finalName = ASYNC_FINAL_OUTPUT_BY_OP[opName]
  if (resolved.defaultManifestOutputs || finalName === "__adobeAsyncResultPassthrough") return "manifest"
  if (finalName === "JobResult") {
    return /video/i.test(opName) ? "video-job" : "image-job"
  }
  if (finalName === "PreciseUpsamplerResponse") return "upscaler"
  const photoshopMulti = new Set([
    "photoshop-auto-crop",
    "photoshop-create-artboard",
    "photoshop-create-composite",
    "photoshop-edit",
    "photoshop-actions",
  ])
  if (photoshopMulti.has(opName) || finalName === "Result") return "photoshop-multi"
  if (
    finalName &&
    (/Rendition|Export|StatusAPIResponse|FireflyJobResponse/i.test(finalName) ||
      /rendition|export-rendition|generate-speech|generate-avatar|transcribe|dub/i.test(opName))
  ) {
    return "url-blob"
  }
  if (resolved.schema) return "passthrough"
  return "passthrough"
}

/** @type {object | undefined} */
let manifestDocumentSchema
function loadManifestSchema() {
  if (manifestDocumentSchema) return manifestDocumentSchema
  const path = join(pluginRoot, "openapi/overlays/manifest-document.schema.json")
  manifestDocumentSchema = JSON.parse(readFileSync(path, "utf8"))
  return manifestDocumentSchema
}

/**
 * Zod returns expression and runtime product-shape metadata.
 * @param {string} opName
 * @param {ProductShapeKind} kind
 * @param {import('./zod-emitter.mjs').ZodEmitter} outputEmitter
 * @param {string} context
 * @returns {{ returnsZod: string, productShape: object, usesFileRef: boolean, returnsJsonSchema?: object }}
 */
export function shapeCapabilityReturns(opName, kind, outputEmitter, context) {
  const ref = USES_FILE_REF_IMPORT
  switch (kind) {
    case "image-job":
      return {
        usesFileRef: true,
        productShape: { kind: "image-job", mediaArray: "images" },
        returnsZod: `z.strictObject({
  images: z.array(${ref}),
  seeds: z.array(z.number().int()).optional(),
  size: z.strictObject({ width: z.number().int(), height: z.number().int() }).optional(),
  contentClass: z.string().optional(),
}).describe("Generated images as url FileRefs with optional seeds and size.")`,
        returnsJsonSchema: {
          type: "object",
          required: ["images"],
          properties: {
            images: { type: "array", items: { $ref: "#/components/schemas/EcpFileRef" } },
            seeds: { type: "array", items: { type: "integer" } },
            size: {
              type: "object",
              properties: { width: { type: "integer" }, height: { type: "integer" } },
            },
            contentClass: { type: "string" },
          },
          additionalProperties: false,
        },
      }
    case "video-job":
      return {
        usesFileRef: true,
        productShape: { kind: "video-job", mediaArray: "videos" },
        returnsZod: `z.strictObject({
  videos: z.array(${ref}),
  seeds: z.array(z.number().int()).optional(),
  size: z.strictObject({ width: z.number().int(), height: z.number().int() }).optional(),
})`,
        returnsJsonSchema: {
          type: "object",
          required: ["videos"],
          properties: {
            videos: { type: "array", items: { $ref: "#/components/schemas/EcpFileRef" } },
            seeds: { type: "array", items: { type: "integer" } },
          },
          additionalProperties: false,
        },
      }
    case "upscaler":
      return {
        usesFileRef: true,
        productShape: { kind: "upscaler" },
        returnsZod: `z.strictObject({ images: z.array(${ref}) })`,
        returnsJsonSchema: {
          type: "object",
          required: ["images"],
          properties: { images: { type: "array", items: { $ref: "#/components/schemas/EcpFileRef" } } },
          additionalProperties: false,
        },
      }
    case "photoshop-multi":
      return {
        usesFileRef: true,
        productShape: { kind: "photoshop-multi" },
        returnsZod: `z.looseObject({}).describe("One url FileRef per requested output, keyed by media type token (png, psd, …).")`,
        returnsJsonSchema: {
          type: "object",
          additionalProperties: { $ref: "#/components/schemas/EcpFileRef" },
        },
      }
    case "manifest": {
      const schema = loadManifestSchema()
      const zod = outputEmitter.schemaToZod(schema, `${context}.manifest`)
      return {
        usesFileRef: false,
        productShape: { kind: "manifest" },
        returnsZod: zod,
        returnsJsonSchema: schema,
      }
    }
    case "url-blob":
      return {
        usesFileRef: true,
        productShape: { kind: "url-blob" },
        returnsZod: `z.looseObject({}).describe("Top-level url fields are promoted to url FileRefs where present.")`,
      }
    default:
      return {
        usesFileRef: false,
        productShape: { kind: "passthrough" },
        returnsZod: undefined,
      }
  }
}

const URL_RESOURCE_REF_SUFFIXES = [
  "InputImage",
  "InputImageV3",
  "BaseInputImage",
  "BaseInputImageV3",
  "FileResourceInput",
  "PortableFileResourceInput",
  "PublicBinaryInput",
  "PublicBinaryInputV3",
  "UrlResourceInput",
  "InputMask",
  "InputMaskV3",
  "BaseInputMask",
  "BaseInputMaskV3",
]

/**
 * @param {any} schema
 * @param {any} doc
 * @returns {boolean}
 */
function isUrlResourceSchema(schema, doc) {
  if (!schema) return false
  let current = schema
  const seen = new Set()
  while (current?.$ref) {
    if (seen.has(current.$ref)) break
    seen.add(current.$ref)
    const name = current.$ref.split("/").pop() ?? ""
    if (URL_RESOURCE_REF_SUFFIXES.some((s) => name.includes(s))) return true
    current = resolveRef(doc, current.$ref)
  }
  if (current?.properties?.source) return true
  if (current?.oneOf?.some((s) => isUrlResourceSchema(s, doc))) return true
  if (current?.allOf?.some((s) => isUrlResourceSchema(s, doc))) return true
  return false
}

/**
 * @param {any} doc
 * @param {string} ref
 */
function resolveRef(doc, ref) {
  if (!ref?.startsWith("#/")) return undefined
  let cur = doc
  for (const p of ref.slice(2).split("/")) cur = cur?.[p]
  return cur
}

/**
 * Body field names that accept a single url FileRef instead of the API envelope.
 * @param {string} fieldName
 * @param {any} bodySchemaRef
 * @param {any} doc
 */
export function bodyFieldAcceptsFileRef(fieldName, bodySchemaRef, doc) {
  if (fieldName === "image" || fieldName === "mask" || fieldName === "background" || fieldName === "object") {
    return true
  }
  const schema = typeof bodySchemaRef === "object" ? bodySchemaRef : undefined
  if (schema && isUrlResourceSchema(schema, doc)) return true
  return false
}

/**
 * Replace hoisted body fields that carry URL resources with FileRef in accepts.
 * @param {import('./generate.mjs').BuiltInput} built
 * @param {any} operation
 * @param {any} doc
 * @param {Map<string, any>} bodyFieldSchemas field name → request body property schema
 * @returns {{ usesFileRef: boolean }}
 */
export function reshapeCapabilityAccepts(built, operation, doc, bodyFieldSchemas) {
  let usesFileRef = false
  const ref = USES_FILE_REF_IMPORT
  const nextFields = []
  for (const line of built.fields) {
    const match = /^\s+"?([a-zA-Z0-9_-]+)"?:\s*/.exec(line)
    const fieldName = match?.[1]
    if (fieldName && built.parameters.body.includes(fieldName) && bodyFieldAcceptsFileRef(fieldName, bodyFieldSchemas.get(fieldName), doc)) {
      const optional = line.includes(".optional()")
      const descMatch = line.match(/\.describe\((.+)\)\s*,?\s*$/)
      const describe = descMatch ? `.describe(${descMatch[1]})` : ""
      const opt = optional ? ".optional()" : ""
      nextFields.push(`  ${fieldName}: ${ref}${opt}${describe}`)
      usesFileRef = true
    } else {
      nextFields.push(line)
    }
  }
  built.fields = nextFields
  return { usesFileRef }
}

/**
 * @param {any} operation
 * @param {any} doc
 * @returns {Map<string, any>}
 */
export function collectBodyFieldSchemas(operation, doc) {
  /** @type {Map<string, any>} */
  const map = new Map()
  const rb = operation.requestBody?.$ref ? resolveRef(doc, operation.requestBody.$ref) : operation.requestBody
  const content = rb?.content ?? {}
  const json = content["application/json"] ?? content["*/*"]
  let schema = json?.schema
  if (schema?.$ref) schema = resolveRef(doc, schema.$ref)
  if (schema?.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) map.set(name, prop)
  }
  return map
}

/**
 * @param {string} opName
 * @param {'async-submit' | 'sync'} opClass
 * @param {any} operation
 * @param {any} doc
 * @param {object} resolved
 * @param {import('./zod-emitter.mjs').ZodEmitter} outputEmitter
 * @param {string} context
 */
export function applyProductShape(opName, opClass, operation, doc, resolved, outputEmitter, context) {
  const kind = classifyProductShape(opName, resolved)
  const shaped = shapeCapabilityReturns(opName, kind, outputEmitter, context)
  if (!shaped.returnsZod && resolved.schema) {
    shaped.returnsZod = outputEmitter.schemaToZod(resolved.schema, `${context}.output`)
  }
  if (!shaped.returnsZod) shaped.returnsZod = "z.looseObject({})"
  return { ...shaped, productShapeKind: kind }
}