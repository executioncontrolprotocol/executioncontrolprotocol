/* eslint-disable */
/** Generated Adobe firefly capabilities — do not edit. */
import * as shells from "./shells.js"
import { z } from "zod"
import * as schemas from "./schemas.js"
import { invokeAdobeOperation } from "../../runtime/invoke.js"

/** Generate images */
export const firefly_generate_images_v3_async = shells.firefly_generate_images_v3_async(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/images/generate-async",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "submit",
  })
})

/** Generate images with Image5 */
export const firefly_generate_images_v5_async = shells.firefly_generate_images_v5_async(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v4/images/generate-async",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "submit",
  })
})

/** Generate similar images */
export const firefly_generate_similar_images_v3_async = shells.firefly_generate_similar_images_v3_async(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/images/generate-similar-async",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "submit",
  })
})

/** Expand image */
export const firefly_expand_images_v3_async = shells.firefly_expand_images_v3_async(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/images/expand-async",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "submit",
  })
})

/** Fill image */
export const firefly_fill_images_v3_async = shells.firefly_fill_images_v3_async(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/images/fill-async",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "submit",
  })
})

/** Generate object composite */
export const firefly_generate_object_composite_v3_async = shells.firefly_generate_object_composite_v3_async(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/images/generate-object-composite-async",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "submit",
  })
})

/** Generate precise composite */
export const firefly_precise_composite = shells.firefly_precise_composite(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/images/precise-composite",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "submit",
  })
})

/** Generate adaptive composite */
export const firefly_adaptive_composite = shells.firefly_adaptive_composite(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/images/adaptive-composite",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "submit",
  })
})

/** Upscale image */
export const firefly_precise_upsampler_v3_async = shells.firefly_precise_upsampler_v3_async(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/images/upscale",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "submit",
  })
})

/** Generate video */
export const firefly_generate_video_v3 = shells.firefly_generate_video_v3(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/videos/generate",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "submit",
  })
})

/** Retrieve custom models */
export const firefly_get_custom_models = shells.firefly_get_custom_models(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v3/custom-models",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_CustomModelsFF3pInfo,
    asyncMode: "none",
  })
})

/** Upload image */
export const firefly_storage_image_v2 = shells.firefly_storage_image_v2(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/storage/image",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_StorageImageResponse,
    asyncMode: "none",
  })
})

/** Get job status */
export const firefly_job_result_v3 = shells.firefly_job_result_v3(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v3/status/{jobId}",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_JobResponse,
    asyncMode: "none",
  })
})

/** Cancel job */
export const firefly_cancel_job_v4 = shells.firefly_cancel_job_v4(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "PUT",
    pathTemplate: "/v3/cancel/{jobId}",
    baseUrl: "https://firefly-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.object({}),
    asyncMode: "none",
  })
})
