/* eslint-disable */
/** Generated Adobe indesign capabilities — do not edit. */
import * as shells from "./shells.js"
import { z } from "zod"
import * as schemas from "./schemas.js"
import { invokeAdobeOperation } from "../../runtime/invoke.js"

/** Perform a data merge */
export const indesign_data_merge = shells.indesign_data_merge(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/merge-data",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_succeededEvent,
    asyncMode: "submit",
  })
})

/** Get data merge tags */
export const indesign_data_merge_tags = shells.indesign_data_merge_tags(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/merge-data-tags",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_succeededEvent,
    asyncMode: "submit",
  })
})

/** Remap links */
export const indesign_remap_links = shells.indesign_remap_links(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/remap-links",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_succeededEvent,
    asyncMode: "submit",
  })
})

/** Create JPEG, PNG, or PDF renditions */
export const indesign_rendition_job = shells.indesign_rendition_job(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/create-rendition",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_succeededEvent,
    asyncMode: "submit",
  })
})

/** List custom scripts API */
export const indesign_list_custom_scripts = shells.indesign_list_custom_scripts(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v3/scripts",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_CustomScriptsListResponse,
    asyncMode: "none",
  })
})

/** Submit a Custom Script */
export const indesign_submit_custom_script = shells.indesign_submit_custom_script(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/scripts",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_succeededEvent,
    asyncMode: "submit",
  })
})

/** Submit a custom script execution request */
export const indesign_execute_custom_script = shells.indesign_execute_custom_script(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/{script_id}/{script_name}",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_succeededEvent,
    asyncMode: "submit",
  })
})

/** Get Custom Script details */
export const indesign_get_custom_script_details = shells.indesign_get_custom_script_details(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v3/scripts/{script_name}",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_CustomScriptDetails,
    asyncMode: "none",
  })
})

/** Delete a Custom Script */
export const indesign_delete_custom_script = shells.indesign_delete_custom_script(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "DELETE",
    pathTemplate: "/v3/scripts/{script_name}",
    baseUrl: "https://indesign.adobe.io/",
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

/** Update Custom Script App Version */
export const indesign_update_script_app_version = shells.indesign_update_script_app_version(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "PUT",
    pathTemplate: "/v3/scripts/{script_name}/app-version",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.object({
  "message": z.string().optional()
}),
    asyncMode: "none",
  })
})

/** Get Current App Versions */
export const indesign_list_app_versions = shells.indesign_list_app_versions(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v3/app-versions",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.array(schemas.Schema_AppVersionInfo),
    asyncMode: "none",
  })
})

/** Get document information */
export const indesign_get_document_info = shells.indesign_get_document_info(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/document-info",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_succeededEvent,
    asyncMode: "submit",
  })
})

/** Get status - Document Info API */
export const indesign_get_document_info_job_status = shells.indesign_get_document_info_job_status(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v3/status/{document-info_job_id}",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.union([schemas.Schema_notstartedEvent, schemas.Schema_runningEvent, schemas.Schema_succeededEvent, schemas.Schema_failedEvent, schemas.Schema_partialSuccessEvent]),
    asyncMode: "none",
  })
})

/** Convert PDF to InDesign document */
export const indesign_convert_pdfto_in_design = shells.indesign_convert_pdfto_in_design(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v3/convert-pdf-to-indesign",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_succeededEvent,
    asyncMode: "submit",
  })
})

/** Get status - Convert PDF to InDesign API */
export const indesign_get_convert_pdfto_in_design_job_status = shells.indesign_get_convert_pdfto_in_design_job_status(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v3/status/{convert-pdf-to-indesign_job_id}",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.union([schemas.Schema_notstartedEvent, schemas.Schema_runningEvent, schemas.Schema_succeededEvent, schemas.Schema_failedEvent, schemas.Schema_partialSuccessEvent]),
    asyncMode: "none",
  })
})

/** Get the status of a job */
export const indesign_get_job_status = shells.indesign_get_job_status(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v3/status/{id}",
    baseUrl: "https://indesign.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.union([schemas.Schema_notstartedEvent, schemas.Schema_runningEvent, schemas.Schema_succeededEvent, schemas.Schema_failedEvent, schemas.Schema_partialSuccessEvent]),
    asyncMode: "none",
  })
})
