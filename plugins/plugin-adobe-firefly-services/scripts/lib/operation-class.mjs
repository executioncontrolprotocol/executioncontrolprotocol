/**
 * Classify Adobe OpenAPI operations into async-submit / status-cancel / sync,
 * and map async submits to final (post-poll) output component schema names.
 */

/** @typedef {'async-submit' | 'status-cancel' | 'sync'} OperationClass */

/**
 * Accept / link-shaped schema names (OpenAPI component last segment).
 * Presence on a non-status op strongly implies async submit.
 */
const ACCEPT_SCHEMA_NAMES = new Set([
  "JobAcceptedResponse",
  "AsyncAcceptResponseV3",
  "AsyncTaskResponse",
  "AsyncTaskResponseV3",
  "AsyncJobResponse",
  "PreciseUpscaleAcceptResponseV3",
  "SubmitAPIResponse",
  "JobStatusLinkResponse",
  "JobLinkResponse",
  "BatchExecuteAcceptedResponse",
  "CancelAcceptedResponse",
  "TemplateDescribeResponse",
  "TemplateRenderResponse",
  // Express JobResponse is accept-only (jobId + statusUrl)
  "JobResponse",
  "CustomScriptExecuteResponse",
])

/**
 * Final output schema overrides keyed by capability opName (family-kebab).
 * Values are OpenAPI component names in that family's schemas, or a special
 * runtime import token for handwritten schemas.
 *
 * @type {Record<string, string>}
 */
export const ASYNC_FINAL_OUTPUT_BY_OP = {
  // photoshop — unwrap JobStatusResponse.result
  "photoshop-auto-crop": "Result",
  "photoshop-create-artboard": "Result",
  "photoshop-create-composite": "Result",
  "photoshop-edit": "Result",
  "photoshop-execute-actions": "Result",
  "photoshop-generate-manifest": "__photoshopManifestDocumentSchema",

  // firefly — unwrap JobResponse.result
  "firefly-generate-images-v3-async": "JobResult",
  "firefly-generate-images-v5-async": "JobResult",
  "firefly-generate-similar-images-v3-async": "JobResult",
  "firefly-expand-images-v3-async": "JobResult",
  "firefly-fill-images-v3-async": "JobResult",
  "firefly-generate-object-composite-v3-async": "JobResult",
  "firefly-precise-composite": "JobResult",
  "firefly-adaptive-composite": "JobResult",
  "firefly-precise-upsampler-v3-async": "PreciseUpsamplerResponse",
  "firefly-generate-video-v3": "JobResult",

  // express — status endpoint returns this union shape when complete
  "express-generate-variation": "GenerateVariationResponse",
  "express-export-rendition": "ExportRenditionResponse",

  // illustrator
  "illustrator-register-custom-script-capability": "CapabilityRegistrationResponse",
  "illustrator-execute-custom-script-capability": "CustomScriptJobSucceededResponse",
  "illustrator-data-merge": "DataMergeJobApiResponse",
  "illustrator-create-rendition": "CreateRenditionJobApiResponse",
  "illustrator-trace-image": "ImageTraceJobApiResponse",

  // indesign — succeeded event is the happy-path final; status caps keep full union
  "indesign-data-merge": "succeededEvent",
  "indesign-data-merge-tags": "succeededEvent",
  "indesign-remap-links": "succeededEvent",
  "indesign-rendition-job": "succeededEvent",
  "indesign-submit-custom-script": "succeededEvent",
  "indesign-execute-custom-script": "succeededEvent",
  "indesign-get-document-info": "succeededEvent",
  "indesign-convert-pdfto-in-design": "succeededEvent",

  // audio-video
  "audio-video-generate-speech": "StatusAPIResponse",
  "audio-video-generate-avatar": "StatusAPIResponse",
  "audio-video-template-describe": "StatusAPIResponse",
  "audio-video-template-render": "JobStatus",
  "audio-video-generate-reframed-video": "StatusAPIResponse",
  "audio-video-generate-reframed-video-v2": "StatusAPIResponse",
  "audio-video-transcribe": "FireflyJobResponse",
  "audio-video-dub": "FireflyJobResponse",
  "audio-video-transcribe-transcribe": "FireflyJobResponse",
  "audio-video-dub-dub": "FireflyJobResponse",

  // creative-production
  "creative-production-batch-execute": "BatchStatusResponse",

  // substance3d — unwrap the inner job result after poll
  "substance3d-v1-composites-compose": "restv1beta.ComposeSceneJobResult",
  "substance3d-v1-scenes-assemble": "restv1beta.CreateSceneJobResult",
  "substance3d-v1-scenes-convert": "restv1beta.ModelConvertJobResult",
  "substance3d-v1-scenes-describe": "restv1beta.SceneDescJobResult",
  "substance3d-v1-scenes-render": "restv1beta.RenderSceneJobResult",
  "substance3d-v1-scenes-render-basic": "restv1beta.RenderSceneJobResult",
}

/**
 * @param {string | undefined} ref
 */
function schemaNameFromRef(ref) {
  if (!ref || typeof ref !== "string") return ""
  const parts = ref.split("/")
  return parts[parts.length - 1] || ""
}

/**
 * @param {object} operation
 * @param {object} doc
 */
function primaryJsonSchemaRef(operation, doc, preferCodes) {
  const responses = operation.responses ?? {}
  for (const code of preferCodes) {
    const resp = responses[code]
    if (!resp) continue
    const resolved = resp.$ref ? resolveRef(doc, resp.$ref) : resp
    const content = resolved?.content ?? {}
    const json = content["application/json"] ?? content["*/*"]
    const schema = json?.schema
    if (schema?.$ref) return schemaNameFromRef(schema.$ref)
    if (schema) return "" // inline
  }
  return ""
}

/**
 * @param {object} doc
 * @param {string} ref
 */
function resolveRef(doc, ref) {
  if (!ref.startsWith("#/")) return undefined
  const parts = ref.slice(2).split("/")
  let cur = doc
  for (const p of parts) cur = cur?.[p]
  return cur
}

/**
 * @param {string} path
 * @param {string} operationId
 * @param {string} method
 * @param {string[]} responseCodes
 * @param {string} acceptSchemaName
 * @param {string} opName
 * @returns {OperationClass}
 */
export function classifyOperation({
  path,
  operationId,
  method,
  responseCodes,
  acceptSchemaName,
  opName,
}) {
  const pathLower = path.toLowerCase()
  const idLower = (operationId || "").toLowerCase()
  const nameLower = (opName || "").toLowerCase()

  const isStatusPath =
    /\/status(\/|$)/.test(pathLower) ||
    /job-?status|job-?result|get-?job-?status|jobresult/.test(idLower) ||
    /-(job-status|job-result|get-job-status|status)$/.test(nameLower) ||
    nameLower.endsWith("-status") ||
    nameLower.includes("-job-status") ||
    nameLower.includes("-job-result")

  const isCancel =
    /\/cancel(\/|$)/.test(pathLower) ||
    /cancel/.test(idLower) ||
    nameLower.includes("-cancel-") ||
    nameLower.endsWith("-cancel") ||
    nameLower.includes("cancel-batch") ||
    nameLower.includes("cancel-render") ||
    nameLower.includes("cancel-job")

  if (isStatusPath || isCancel) return "status-cancel"

  if (ASYNC_FINAL_OUTPUT_BY_OP[opName]) return "async-submit"

  if (responseCodes.includes("202") && !isCancel) return "async-submit"

  // Firefly Image5 returns 200 + AsyncTaskResponse (still async)
  if (ACCEPT_SCHEMA_NAMES.has(acceptSchemaName) && method !== "GET") {
    return "async-submit"
  }

  if (/async/i.test(operationId) || /async/i.test(opName)) return "async-submit"

  return "sync"
}

/**
 * Resolve accept schema name from the operation's primary success response.
 * @param {object} operation
 * @param {object} doc
 */
export function acceptSchemaNameForOperation(operation, doc) {
  const codes = Object.keys(operation.responses ?? {}).sort()
  // Prefer 202 when present, else first 2xx
  if (codes.includes("202")) {
    return primaryJsonSchemaRef(operation, doc, ["202"])
  }
  const success = codes.filter((c) => /^2/.test(c))
  return primaryJsonSchemaRef(operation, doc, success)
}

/**
 * @param {string} opName
 * @param {OperationClass} opClass
 * @param {object} operation
 * @param {object} doc
 * @param {(schema: object, context: string) => string} schemaToZod
 * @returns {{ outputZod: string, materialize?: string, finalComponent?: string }}
 */
export function resolveOutputForOperation(opName, opClass, operation, doc, schemaToZod) {
  if (opClass !== "async-submit") {
    return { outputZod: schemaToZod(successResponseSchema(operation, doc), `${opName}.output`) }
  }

  const finalName = ASYNC_FINAL_OUTPUT_BY_OP[opName]
  if (finalName === "__photoshopManifestDocumentSchema") {
    return {
      outputZod: "photoshopManifestDocumentSchema",
      materialize: "photoshop-manifest",
      finalComponent: finalName,
    }
  }

  if (finalName) {
    // Prefer $ref so emitter emits Schema_* from components
    const refSchema = { $ref: `#/components/schemas/${finalName}` }
    return {
      outputZod: schemaToZod(refSchema, `${opName}.finalOutput`),
      finalComponent: finalName,
    }
  }

  // Fallback: keep OpenAPI success schema (e.g. substance already job-shaped)
  return { outputZod: schemaToZod(successResponseSchema(operation, doc), `${opName}.output`) }
}

/**
 * Pick primary 2xx application/json response schema (same as codegen helper).
 * @param {object} operation
 * @param {object} doc
 */
export function successResponseSchema(operation, doc) {
  const responses = operation.responses ?? {}
  const codes = Object.keys(responses).sort()
  const successCodes = codes.filter((c) => c.startsWith("2") || c === "default")
  for (const code of successCodes) {
    const resp = responses[code]
    const resolved = resp?.$ref ? resolveRef(doc, resp.$ref) : resp
    const content = resolved?.content ?? {}
    const json =
      content["application/json"] ??
      content["application/problem+json"] ??
      content["*/*"]
    if (json?.schema) return json.schema
  }
  return { type: "object", properties: {}, additionalProperties: false }
}
