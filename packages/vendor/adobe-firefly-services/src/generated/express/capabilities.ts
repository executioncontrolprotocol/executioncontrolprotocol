/* eslint-disable */
/** Generated Adobe express capabilities — do not edit. */
import * as shells from "./shells.js"
import { z } from "zod"
import * as schemas from "./schemas.js"
import { invokeAdobeOperation } from "../../runtime/invoke.js"

/** Tagged documents */
export const express_tagged_documents = shells.express_tagged_documents(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/beta/tagged-documents",
    baseUrl: "https://express-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_TaggedDocumentsResponse,
    asyncMode: "none",
  })
})

/** Tagged document details */
export const express_tagged_document_details = shells.express_tagged_document_details(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/beta/tagged-documents/{documentId}",
    baseUrl: "https://express-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_TaggedDocumentDetailsResponse,
    asyncMode: "none",
  })
})

/** Generate variation */
export const express_generate_variation = shells.express_generate_variation(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/beta/generate-variation",
    baseUrl: "https://express-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_GenerateVariationResponse,
    asyncMode: "submit",
  })
})

/** Export rendition */
export const express_export_rendition = shells.express_export_rendition(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/beta/export-rendition",
    baseUrl: "https://express-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_ExportRenditionResponse,
    asyncMode: "submit",
  })
})

/** Job status */
export const express_get_job_status = shells.express_get_job_status(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/status/{jobId}",
    baseUrl: "https://express-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.union([schemas.Schema_JobStatusResponse, schemas.Schema_ExportRenditionResponse, schemas.Schema_GenerateVariationResponse]),
    asyncMode: "none",
  })
})
