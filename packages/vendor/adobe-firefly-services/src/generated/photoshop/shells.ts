/* eslint-disable */
/** Generated Adobe photoshop capability shells — do not edit. */
import { capabilityFor, type CapabilityHandler } from "@executioncontrolprotocol/core"
import { z } from "zod"
import * as schemas from "./schemas.js"
import { photoshopManifestDocumentSchema } from "../../runtime/photoshop-manifest.js"

const EXT_ID = "@executioncontrolprotocol/adobe-firefly-services"

/** Auto crop */
export function photoshop_auto_crop(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-auto-crop")
    .withInput(z.object({
  body: schemas.Schema_AutoCropRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobStatusResponse)
    .withMetadata({"summary":"Auto crop","description":"Generates smart crops, subject bounding boxes, and detects objects for an input image. The request is processed asynchronously. Poll GET /v2/status/{jobId} with the returned jobId for completion.","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to auto crop"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids, status, or asset URLs)."}]})
    .withHandler(handler)
}

/** Create an artboard */
export function photoshop_create_artboard(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-create-artboard")
    .withInput(z.object({
  body: schemas.Schema_CreateArtboardRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobStatusResponse)
    .withMetadata({"summary":"Create an artboard","description":"Create an artboard","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to create an artboard"],"projections":[{"summary":"Take returned assets","description":"Keep asset URLs or output references from the result for download or the next edit step."},{"summary":"Keep job identifiers","description":"When a job id is returned, keep it so you can poll status until outputs are ready."}]})
    .withHandler(handler)
}

/** Create or edit a composite */
export function photoshop_create_composite(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-create-composite")
    .withInput(z.object({
  body: schemas.Schema_CreateCompositeRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobStatusResponse)
    .withMetadata({"summary":"Create or edit a composite","description":"Create or edit a composite","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to create or edit a composite"],"projections":[{"summary":"Take returned assets","description":"Keep asset URLs or output references from the result for download or the next edit step."},{"summary":"Keep job identifiers","description":"When a job id is returned, keep it so you can poll status until outputs are ready."}]})
    .withHandler(handler)
}

/** Edit an image with various adjustments */
export function photoshop_edit(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-edit")
    .withInput(z.object({
  body: schemas.Schema_EditRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobStatusResponse)
    .withMetadata({"summary":"Edit an image with various adjustments","description":"Edit an image with various adjustments","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to edit an image with various adjustments"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids, status, or asset URLs)."}]})
    .withHandler(handler)
}

/** Execute Photoshop actions, scripts, and transformations */
export function photoshop_execute_actions(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-execute-actions")
    .withInput(z.object({
  body: schemas.Schema_ActionsRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobStatusResponse)
    .withMetadata({"summary":"Execute Photoshop actions, scripts, and transformations","description":"Execute Photoshop actions, scripts, and transformations","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to execute Photoshop actions, scripts, and transformations"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids, status, or asset URLs)."}]})
    .withHandler(handler)
}

/** Generate a manifest for given input image */
export function photoshop_generate_manifest(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-generate-manifest")
    .withInput(z.object({
  body: schemas.Schema_GenerateManifestRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(photoshopManifestDocumentSchema)
    .withMetadata({"summary":"Generate a manifest for given input image","description":"Generate a manifest for given input image","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to generate a manifest for given input image"],"projections":[{"summary":"Inspect the structured result","description":"Read the returned document or asset facts you need for authoring, such as names, sizes, and ids."}]})
    .withHandler(handler)
}

/** Get Job Status */
export function photoshop_get_job_status(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-get-job-status")
    .withInput(z.object({
  path: z.object({
  "jobId": z.string()
})
}))
    .withOutput(schemas.Schema_JobStatusResponse)
    .withMetadata({"summary":"Get Job Status","description":"Retrieves the current status and details of a specific job including metadata, outputs, and processing information. Use this endpoint to poll jobs submitted to Photoshop v2 operations and POST /v1/auto-crop.","useCases":["Photoshop Job Status tasks that need this operation","When the workflow goal is to get Job Status"],"projections":[{"summary":"Read job status","description":"Take the job status and identifiers so you know whether to wait, retry, or continue."},{"summary":"Take completed outputs","description":"When the job succeeded, take output or result URLs and asset references for the next step."}]})
    .withHandler(handler)
}
