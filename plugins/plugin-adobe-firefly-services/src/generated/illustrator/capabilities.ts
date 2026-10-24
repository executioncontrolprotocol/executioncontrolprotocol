/* eslint-disable */
/** Generated Adobe illustrator capabilities — do not edit. */
import * as shells from "./shells.js"
import { z } from "zod"
import * as schemas from "./schemas.js"
import { invokeAdobeOperation } from "../../runtime/invoke.js"

/** Submit a Custom Script */
export const illustrator_register_custom_script_capability = shells.illustrator_register_custom_script_capability(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/run-scripts",
    baseUrl: "https://illustrator.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_CapabilityRegistrationResponse,
    asyncMode: "submit",
  })
})

/** Submit a custom script execution request */
export const illustrator_execute_custom_script_capability = shells.illustrator_execute_custom_script_capability(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/{orgId}/{capabilityName}",
    baseUrl: "https://illustrator.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_CustomScriptJobSucceededResponse,
    asyncMode: "submit",
  })
})

/** Retrieve job status */
export const illustrator_custom_scripts_job_status = shells.illustrator_custom_scripts_job_status(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v3/status/{jobId}",
    baseUrl: "https://illustrator.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.union([schemas.Schema_CustomScriptJobSucceededResponse, schemas.Schema_CustomScriptJobRunningResponse, schemas.Schema_CustomScriptJobFailedResponse]),
    asyncMode: "none",
  })
})

/** Data merge */
export const illustrator_data_merge = shells.illustrator_data_merge(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/merge-data",
    baseUrl: "https://illustrator-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_DataMergeJobApiResponse,
    asyncMode: "submit",
  })
})

/** Create rendition */
export const illustrator_create_rendition = shells.illustrator_create_rendition(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/create-rendition",
    baseUrl: "https://illustrator-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_CreateRenditionJobApiResponse,
    asyncMode: "submit",
  })
})

/** Submit a job */
export const illustrator_trace_image = shells.illustrator_trace_image(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/trace-image",
    baseUrl: "https://illustrator-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_ImageTraceJobApiResponse,
    asyncMode: "submit",
  })
})

/** Retrieve job status */
export const illustrator_image_trace_job_status = shells.illustrator_image_trace_job_status(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v1/status/{jobId}/image-trace",
    baseUrl: "https://illustrator-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.union([schemas.Schema_ImageTraceJobApiResponse, schemas.Schema_JobStatusPollPayload, schemas.Schema_ImageTraceJobFailedResponse]),
    asyncMode: "none",
  })
})

/** Retrieve job status */
export const illustrator_facade_job_status = shells.illustrator_facade_job_status(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v1/status/{jobId}",
    baseUrl: "https://illustrator-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.union([schemas.Schema_DataMergeJobApiResponse, schemas.Schema_CreateRenditionJobApiResponse, schemas.Schema_JobStatusPollPayload, schemas.Schema_DataMergeJobFailedResponse, schemas.Schema_DataMergeJobPartiallySucceededResponse]),
    asyncMode: "none",
  })
})
