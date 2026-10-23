/* eslint-disable */
/** Generated Adobe photoshop capabilities — do not edit. */
import * as shells from "./shells.js"
import * as schemas from "./schemas.js"
import { invokeAdobeOperation } from "../../runtime/invoke.js"
import { photoshopManifestDocumentSchema } from "../../runtime/photoshop-manifest.js"

/** Auto crop */
export const photoshop_auto_crop = shells.photoshop_auto_crop(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/auto-crop",
    baseUrl: "https://photoshop-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobStatusResponse,
    asyncMode: "submit",
  })
})

/** Create an artboard */
export const photoshop_create_artboard = shells.photoshop_create_artboard(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/create-artboard",
    baseUrl: "https://photoshop-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobStatusResponse,
    asyncMode: "submit",
  })
})

/** Create or edit a composite */
export const photoshop_create_composite = shells.photoshop_create_composite(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/create-composite",
    baseUrl: "https://photoshop-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobStatusResponse,
    asyncMode: "submit",
  })
})

/** Edit an image with various adjustments */
export const photoshop_edit = shells.photoshop_edit(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/edit",
    baseUrl: "https://photoshop-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobStatusResponse,
    asyncMode: "submit",
  })
})

/** Execute Photoshop actions, scripts, and transformations */
export const photoshop_execute_actions = shells.photoshop_execute_actions(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/execute-actions",
    baseUrl: "https://photoshop-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobStatusResponse,
    asyncMode: "submit",
  })
})

/** Generate a manifest for given input image */
export const photoshop_generate_manifest = shells.photoshop_generate_manifest(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/generate-manifest",
    baseUrl: "https://photoshop-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: photoshopManifestDocumentSchema,
    asyncMode: "submit",
    materialize: "photoshop-manifest",
  })
})

/** Get Job Status */
export const photoshop_get_job_status = shells.photoshop_get_job_status(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v2/status/{jobId}",
    baseUrl: "https://photoshop-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_JobStatusResponse,
    asyncMode: "none",
  })
})
