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
    .withMetadata({"summary":"Auto crop","description":"Generates smart crops, subject bounding boxes, and detects objects for an input image. The request is processed asynchronously. Poll GET /v2/status/{jobId} with the returned jobId for completion.","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to auto crop"],"samplePrompts":["Auto crop","Auto crop with Adobe Photoshop"]})
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
    .withMetadata({"summary":"Create an artboard","description":"Create an artboard","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to create an artboard"],"samplePrompts":["Create an artboard","Create an artboard with Adobe Photoshop"]})
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
    .withMetadata({"summary":"Create or edit a composite","description":"Create or edit a composite","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to create or edit a composite"],"samplePrompts":["Create or edit a composite","Create or edit a composite with Adobe Photoshop"]})
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
    .withMetadata({"summary":"Edit an image with various adjustments","description":"Edit an image with various adjustments","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to edit an image with various adjustments"],"samplePrompts":["Edit an image with various adjustments","Edit an image with various adjustments with Adobe Photoshop"]})
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
    .withMetadata({"summary":"Execute Photoshop actions, scripts, and transformations","description":"Execute Photoshop actions, scripts, and transformations","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to execute Photoshop actions, scripts, and transformations"],"samplePrompts":["Execute Photoshop actions, scripts, and transformations","Execute Photoshop actions, scripts, and transformations with Adobe Photoshop"]})
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
    .withMetadata({"summary":"Generate a manifest for given input image","description":"Generate a manifest for given input image","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to generate a manifest for given input image"],"samplePrompts":["Generate a manifest for given input image","Generate a manifest for given input image with Adobe Photoshop"]})
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
    .withMetadata({"summary":"Get Job Status","description":"Retrieves the current status and details of a specific job including metadata, outputs, and processing information. Use this endpoint to poll jobs submitted to Photoshop v2 operations and POST /v1/auto-crop.","useCases":["Photoshop Job Status tasks that need this operation","When the workflow goal is to get Job Status"],"samplePrompts":["Get Job Status","Get Job Status with Adobe Photoshop"]})
    .withHandler(handler)
}
