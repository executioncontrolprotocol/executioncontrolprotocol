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
  aspectRatio: z.union([schemas.Schema_AutoCropAspectRatio, z.array(schemas.Schema_AutoCropAspectRatio)]).optional(),
  focus: z.array(z.string()).optional(),
  image: schemas.Schema_AutoCropInputImage.optional(),
  mode: schemas.Schema_AutoCropMode.optional(),
  outputType: schemas.Schema_AutoCropOutputType.optional(),
  zoom: z.union([z.number(), z.array(z.number())]).optional(),
  body: schemas.Schema_AutoCropRequest.optional()
}))
    .withOutput(schemas.Schema_Result)
    .withMetadata({"summary":"Auto crop","description":"Generates smart crops, subject bounding boxes, and detects objects for an input image. The request is processed asynchronously. Poll GET /v2/status/{jobId} with the returned jobId for completion.","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to auto crop"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}

/** Create an artboard */
export function photoshop_create_artboard(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-create-artboard")
    .withInput(z.object({
  artboardSpacing: z.number().int().optional(),
  images: z.array(schemas.Schema_ArtboardImageInput).optional(),
  outputs: z.array(z.union([schemas.Schema_JpegOutput, schemas.Schema_JsonOutput, schemas.Schema_PngOutput, schemas.Schema_PsdOutput, schemas.Schema_PsdcOutput, schemas.Schema_TiffOutput])).optional(),
  body: schemas.Schema_CreateArtboardRequest.optional()
}))
    .withOutput(schemas.Schema_Result)
    .withMetadata({"summary":"Create an artboard","description":"Create an artboard","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to create an artboard"],"projections":[{"summary":"Take returned assets","description":"Keep asset URLs or output references from the result for download or the next edit step."}]})
    .withHandler(handler)
}

/** Create or edit a composite */
export function photoshop_create_composite(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-create-composite")
    .withInput(z.object({
  edits: schemas.Schema_Edits.optional(),
  fontOptions: schemas.Schema_FontOptions.optional(),
  image: z.union([schemas.Schema_ImageParameters, schemas.Schema_ImageSource]).optional(),
  outputs: z.array(z.union([schemas.Schema_JpegOutput, schemas.Schema_JsonOutput, schemas.Schema_PngOutput, schemas.Schema_PsdOutput, schemas.Schema_PsdcOutput, schemas.Schema_TiffOutput])).optional(),
  body: schemas.Schema_CreateCompositeRequest.optional()
}))
    .withOutput(schemas.Schema_Result)
    .withMetadata({"summary":"Create or edit a composite","description":"Create or edit a composite","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to create or edit a composite"],"projections":[{"summary":"Take returned assets","description":"Keep asset URLs or output references from the result for download or the next edit step."}]})
    .withHandler(handler)
}

/** Edit an image with various adjustments */
export function photoshop_edit(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-edit")
    .withInput(z.object({
  edits: schemas.Schema_LightroomEdits.optional(),
  image: schemas.Schema_EditImageInput.optional(),
  outputs: z.array(z.union([schemas.Schema_LrDngOutput, schemas.Schema_LrJpegOutput, schemas.Schema_LrPngOutput, schemas.Schema_XmpOutput])).optional(),
  body: schemas.Schema_EditRequest.optional()
}))
    .withOutput(schemas.Schema_Result)
    .withMetadata({"summary":"Edit an image with various adjustments","description":"Edit an image with various adjustments","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to edit an image with various adjustments"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}

/** Execute Photoshop actions, scripts, and transformations */
export function photoshop_execute_actions(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-execute-actions")
    .withInput(z.object({
  image: schemas.Schema_ImageSource.optional(),
  options: schemas.Schema_ActionsOptions.optional(),
  outputs: z.array(z.union([schemas.Schema_JpegOutput, schemas.Schema_JsonOutput, schemas.Schema_PngOutput, schemas.Schema_PsdOutput, schemas.Schema_PsdcOutput, schemas.Schema_TiffOutput])).optional(),
  body: schemas.Schema_ActionsRequest.optional()
}))
    .withOutput(schemas.Schema_Result)
    .withMetadata({"summary":"Execute Photoshop actions, scripts, and transformations","description":"Execute Photoshop actions, scripts, and transformations","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to execute Photoshop actions, scripts, and transformations"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}

/** Generate a manifest for given input image */
export function photoshop_generate_manifest(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "photoshop-generate-manifest")
    .withInput(z.object({
  exportOptions: z.union([schemas.Schema_JpegExportOptions, schemas.Schema_PngExportOptions]).optional(),
  extractSmartObjectData: z.boolean().optional(),
  image: schemas.Schema_Image.optional(),
  includeLayerThumbnails: z.boolean().optional(),
  includeXmp: z.boolean().optional(),
  maximumThumbnailDepth: z.number().int().min(0).optional(),
  outputs: z.array(schemas.Schema_ManifestJsonOutput).optional(),
  trimToTransparency: z.boolean().optional(),
  body: schemas.Schema_GenerateManifestRequest.optional()
}))
    .withOutput(photoshopManifestDocumentSchema)
    .withMetadata({"summary":"Generate a manifest for given input image","description":"Generate a manifest for given input image","useCases":["Photoshop Photoshop APIs tasks that need this operation","When the workflow goal is to generate a manifest for given input image"],"projections":[{"summary":"Inspect the structured result","description":"Read the returned document or asset facts you need for authoring, such as names, sizes, and ids."}]})
    .withHandler(handler)
}
