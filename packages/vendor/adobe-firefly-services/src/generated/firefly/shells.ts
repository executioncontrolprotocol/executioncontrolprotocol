/* eslint-disable */
/** Generated Adobe firefly capability shells — do not edit. */
import { capabilityFor, type CapabilityHandler } from "@executioncontrolprotocol/core"
import { z } from "zod"
import * as schemas from "./schemas.js"

const EXT_ID = "@executioncontrolprotocol/adobe-firefly-services"

/** Generate images */
export function firefly_generate_images_v3_async(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-generate-images-v3-async")
    .withInput(z.object({
  headers: z.object({
  "x-model-version": z.enum(["image3", "image3_custom", "image4_standard", "image4_ultra", "image4_custom"]).optional()
}).optional(),
  body: schemas.Schema_GenerateImagesRequestV3,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Generate images","description":"Generate images based on a text prompt. You may also include a reference image and Firefly will try to mimic the characteristics, such as color scheme, lighting, layout of objects in the image, etc.","useCases":["Firefly Common Operations tasks that need this operation","When the workflow goal is to generate images"],"samplePrompts":["Generate images","Generate images with Adobe Firefly"]})
    .withHandler(handler)
}

/** Generate images with Image5 */
export function firefly_generate_images_v5_async(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-generate-images-v5-async")
    .withInput(z.object({
  headers: z.object({
  "x-model-version": z.enum(["image5"])
}).optional(),
  body: schemas.Schema_ImageGenerateRequestV3,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Generate images with Image5","description":"Generate images asynchronously using Firefly's Image5 model. When referenceBlobs is included in the request, omit aspectRatio or set it to auto.","useCases":["Firefly Common Operations tasks that need this operation","When the workflow goal is to generate images with Image5"],"samplePrompts":["Generate images with Image5","Generate images with Image5 with Adobe Firefly"]})
    .withHandler(handler)
}

/** Generate similar images */
export function firefly_generate_similar_images_v3_async(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-generate-similar-images-v3-async")
    .withInput(z.object({
  headers: z.object({
  "x-model-version": z.enum(["image3", "image4_standard", "image4_ultra"]).optional()
}).optional(),
  body: schemas.Schema_GenerateSimilarImagesRequestV3,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Generate similar images","description":"Generate similar images based on a reference image that you provide as a parameter.","useCases":["Firefly Common Operations tasks that need this operation","When the workflow goal is to generate similar images"],"samplePrompts":["Generate similar images","Generate similar images with Adobe Firefly"]})
    .withHandler(handler)
}

/** Expand image */
export function firefly_expand_images_v3_async(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-expand-images-v3-async")
    .withInput(z.object({
  body: schemas.Schema_ExpandImageRequestV3,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Expand image","description":"Change the aspect ratio or size of an image to expand it. Optionally, provide a text prompt to generate additional imagery for the expansion.","useCases":["Firefly Common Operations tasks that need this operation","When the workflow goal is to expand image"],"samplePrompts":["Expand image","Expand image with Adobe Firefly"]})
    .withHandler(handler)
}

/** Fill image */
export function firefly_fill_images_v3_async(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-fill-images-v3-async")
    .withInput(z.object({
  body: schemas.Schema_FillImageRequestV3,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Fill image","description":"Generates a fill in an area of an image based on a text prompt. A mask defines the area of the image to be filled.","useCases":["Firefly Common Operations tasks that need this operation","When the workflow goal is to fill image"],"samplePrompts":["Fill image","Fill image with Adobe Firefly"]})
    .withHandler(handler)
}

/** Generate object composite */
export function firefly_generate_object_composite_v3_async(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-generate-object-composite-v3-async")
    .withInput(z.object({
  body: schemas.Schema_GenerateObjectCompositeRequestV3,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Generate object composite","description":"Combines your image and images generated by Firefly to create an image composite, or scene. The images that Firefly generates are based on a text prompt that you provide. You can upload an image with or without an image mask, such as a product photo, but for a successful result one of the following conditions must be true: The request size is larger than the input image, OR The image contains a transparent layer/channel, OR A mask is provided","useCases":["Firefly Composite Operations tasks that need this operation","When the workflow goal is to generate object composite"],"samplePrompts":["Generate object composite","Generate object composite with Adobe Firefly"]})
    .withHandler(handler)
}

/** Generate precise composite */
export function firefly_precise_composite(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-precise-composite")
    .withInput(z.object({
  headers: z.object({
  "content-type": z.enum(["application/json"])
}).optional(),
  body: schemas.Schema_PreciseCompositeRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Generate precise composite","description":"Submits an asynchronous precise composite generation job using the precise composite pipeline.","useCases":["Firefly Composite Operations tasks that need this operation","When the workflow goal is to generate precise composite"],"samplePrompts":["Generate precise composite","Generate precise composite with Adobe Firefly"]})
    .withHandler(handler)
}

/** Generate adaptive composite */
export function firefly_adaptive_composite(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-adaptive-composite")
    .withInput(z.object({
  headers: z.object({
  "content-type": z.enum(["application/json"])
}).optional(),
  body: schemas.Schema_AdaptiveCompositeRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Generate adaptive composite","description":"Submits an asynchronous adaptive composite generation job using the adaptive composite pipeline.","useCases":["Firefly Composite Operations tasks that need this operation","When the workflow goal is to generate adaptive composite"],"samplePrompts":["Generate adaptive composite","Generate adaptive composite with Adobe Firefly"]})
    .withHandler(handler)
}

/** Upscale image */
export function firefly_precise_upsampler_v3_async(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-precise-upsampler-v3-async")
    .withInput(z.object({
  headers: z.object({
  "x-model-version": z.enum(["precise_upsampler_v1"]).optional()
}).optional(),
  body: schemas.Schema_PreciseUpsamplerRequestV3,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Upscale image","description":"Upscales an image asynchronously using the precise upsampler. Provide the input image via an upload ID from the storage API or a presigned URL. The response includes links to check status and retrieve the result. Poll the status URL until the job completes, then fetch the result for the upscaled image(s).","useCases":["Firefly Upscale tasks that need this operation","When the workflow goal is to upscale image"],"samplePrompts":["Upscale image","Upscale image with Adobe Firefly"]})
    .withHandler(handler)
}

/** Generate video */
export function firefly_generate_video_v3(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-generate-video-v3")
    .withInput(z.object({
  headers: z.object({
  "x-model-version": z.enum(["video1_standard"])
}).optional(),
  body: schemas.Schema_GenerateVideoRequestV3,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Generate video","description":"Generate a five second video using a text prompt.","useCases":["Firefly Common Operations tasks that need this operation","When the workflow goal is to generate video"],"samplePrompts":["Generate video","Generate video with Adobe Firefly"]})
    .withHandler(handler)
}

/** Retrieve custom models */
export function firefly_get_custom_models(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-get-custom-models")
    .withInput(z.object({
  query: z.object({
  "sortBy": z.enum(["assetName", "createdDate", "modifiedDate"]).optional(),
  "start": z.string().optional(),
  "limit": z.string().optional(),
  "publishedState": z.enum(["all", "ready", "published", "unpublished", "queued", "training", "failed", "cancelled"]).optional()
}).optional(),
  headers: z.object({
  "x-user-token": z.string().optional(),
  "x-request-id": z.string()
}).optional()
}))
    .withOutput(schemas.Schema_CustomModelsFF3pInfo)
    .withMetadata({"summary":"Retrieve custom models","description":"Retrieve the custom models for a user.","useCases":["Firefly Common Operations tasks that need this operation","When the workflow goal is to retrieve custom models"],"samplePrompts":["Retrieve custom models","Retrieve custom models with Adobe Firefly"]})
    .withHandler(handler)
}

/** Upload image */
export function firefly_storage_image_v2(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-storage-image-v2")
    .withInput(z.object({}))
    .withOutput(schemas.Schema_StorageImageResponse)
    .withMetadata({"summary":"Upload image","description":"Upload source image or mask for image-to-image operations, such as fill, expand, or upscale. This API returns an identifier that is used to refer to uploaded content. The uploaded assets will be valid for 7 days from the date you upload them.","useCases":["Firefly Common Operations tasks that need this operation","When the workflow goal is to upload image"],"samplePrompts":["Upload image","Upload image with Adobe Firefly"]})
    .withHandler(handler)
}

/** Get job status */
export function firefly_job_result_v3(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-job-result-v3")
    .withInput(z.object({
  path: z.object({
  "jobId": z.string()
})
}))
    .withOutput(schemas.Schema_JobResponse)
    .withMetadata({"summary":"Get job status","description":"Get the status of an asynchronous job (including upscale jobs). When the job has completed successfully, the result reflects the operation type (for example generation, composite, or upscale).","useCases":["Firefly Manage jobs tasks that need this operation","When the workflow goal is to get job status"],"samplePrompts":["Get job status","Get job status with Adobe Firefly"]})
    .withHandler(handler)
}

/** Cancel job */
export function firefly_cancel_job_v4(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "firefly-cancel-job-v4")
    .withInput(z.object({
  path: z.object({
  "jobId": z.string()
})
}))
    .withOutput(z.object({}))
    .withMetadata({"summary":"Cancel job","description":"Cancel an asynchronous job.","useCases":["Firefly Manage jobs tasks that need this operation","When the workflow goal is to cancel job"],"samplePrompts":["Cancel job","Cancel job with Adobe Firefly"]})
    .withHandler(handler)
}
