/* eslint-disable */
/** Generated Adobe indesign capability shells — do not edit. */
import { capabilityFor, type CapabilityHandler } from "@executioncontrolprotocol/core"
import { z } from "zod"
import * as schemas from "./schemas.js"

const EXT_ID = "@executioncontrolprotocol/adobe-firefly-services"

/** Perform a data merge */
export function indesign_data_merge(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-data-merge")
    .withInput(z.object({
  body: schemas.Schema_MergeDataRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_succeededEvent)
    .withMetadata({"summary":"Perform a data merge","description":"Creates InDesign documents or PDFs by merging CSV data with InDesign templates. Supports multiple output formats: JPEG (`image/jpeg`), PNG (`image/png`), PDF (`application/pdf`), and InDesign (`application/x-indesign`).","useCases":["Indesign Data Merge tasks that need this operation","When the workflow goal is to perform a data merge"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids, status, or asset URLs)."}]})
    .withHandler(handler)
}

/** Get data merge tags */
export function indesign_data_merge_tags(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-data-merge-tags")
    .withInput(z.object({
  body: schemas.Schema_MergeDataTagsRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_succeededEvent)
    .withMetadata({"summary":"Get data merge tags","description":"Retrieves the data merge tags from a document.","useCases":["Indesign Data Merge tasks that need this operation","When the workflow goal is to get data merge tags"],"projections":[{"summary":"Take listed items","description":"Keep each item id and display name from the list so later steps can select one."}]})
    .withHandler(handler)
}

/** Remap links */
export function indesign_remap_links(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-remap-links")
    .withInput(z.object({
  headers: z.object({
  "x-aem-token": z.string()
}).optional(),
  body: schemas.Schema_RemapLinksRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_succeededEvent)
    .withMetadata({"summary":"Remap links","description":"Replaces file-based links in InDesign documents with AEM URLs. Particularly useful for customers working with Adobe Experience Manager (AEM) using Adobe Asset Link, enabling designers to work with output files that have direct links to AEM URLs.","useCases":["Indesign Remap Links tasks that need this operation","When the workflow goal is to remap links"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids, status, or asset URLs)."}]})
    .withHandler(handler)
}

/** Create JPEG, PNG, or PDF renditions */
export function indesign_rendition_job(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-rendition-job")
    .withInput(z.object({
  body: schemas.Schema_CreateRenditionRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_succeededEvent)
    .withMetadata({"summary":"Create JPEG, PNG, or PDF renditions","description":"Creates JPEG, PNG, or PDF renditions of InDesign documents. Supports multiple output formats: JPEG (`image/jpeg`), PNG (`image/png`), and PDF (`application/pdf`).","useCases":["Indesign Rendition tasks that need this operation","When the workflow goal is to create JPEG, PNG, or PDF renditions"],"projections":[{"summary":"Read job status","description":"Take the job status and identifiers so you know whether to wait, retry, or continue."},{"summary":"Take completed outputs","description":"When the job succeeded, take output or result URLs and asset references for the next step."}]})
    .withHandler(handler)
}

/** List custom scripts API */
export function indesign_list_custom_scripts(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-list-custom-scripts")
    .withInput(z.object({
  query: z.object({
  "page": z.number().int().optional()
}).optional()
}))
    .withOutput(schemas.Schema_CustomScriptsListResponse)
    .withMetadata({"summary":"List custom scripts API","description":"Retrieves details of the latest version of all registered custom scripts. Includes version, download link, registration date, and script name. Response is paginated based on list length.","useCases":["Indesign Custom Scripts tasks that need this operation","When the workflow goal is to list custom scripts API"],"projections":[{"summary":"Take listed items","description":"Keep each item id and display name from the list so later steps can select one."}]})
    .withHandler(handler)
}

/** Submit a Custom Script */
export function indesign_submit_custom_script(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-submit-custom-script")
    .withInput(z.object({
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_succeededEvent)
    .withMetadata({"summary":"Submit a Custom Script","description":"Submits custom script bundles for registration. Returns a URL for posting execution requests for the registered script.","useCases":["Indesign Custom Scripts tasks that need this operation","When the workflow goal is to submit a Custom Script"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids, status, or asset URLs)."}]})
    .withHandler(handler)
}

/** Submit a custom script execution request */
export function indesign_execute_custom_script(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-execute-custom-script")
    .withInput(z.object({
  path: z.object({
  "script_id": z.string(),
  "script_name": z.string()
}),
  body: schemas.Schema_BaseJobRequestWithOutput,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_succeededEvent)
    .withMetadata({"summary":"Submit a custom script execution request","description":"Submits execution requests for custom scripts. Defines input assets and parameters that the custom script will use during execution.","useCases":["Indesign Custom Scripts tasks that need this operation","When the workflow goal is to submit a custom script execution request"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids, status, or asset URLs)."}]})
    .withHandler(handler)
}

/** Get Custom Script details */
export function indesign_get_custom_script_details(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-get-custom-script-details")
    .withInput(z.object({
  path: z.object({
  "script_name": z.string()
})
}))
    .withOutput(schemas.Schema_CustomScriptDetails)
    .withMetadata({"summary":"Get Custom Script details","description":"Retrieves details of a single registered custom script. Includes version, download link, registration date, and script name.","useCases":["Indesign Custom Scripts tasks that need this operation","When the workflow goal is to get Custom Script details"],"projections":[{"summary":"Inspect the structured result","description":"Read the returned document or asset facts you need for authoring, such as names, sizes, and ids."}]})
    .withHandler(handler)
}

/** Delete a Custom Script */
export function indesign_delete_custom_script(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-delete-custom-script")
    .withInput(z.object({
  path: z.object({
  "script_name": z.string()
})
}))
    .withOutput(z.object({}))
    .withMetadata({"summary":"Delete a Custom Script","description":"Deletes a single registered custom script. All versions of the script will be permanently removed.","useCases":["Indesign Custom Scripts tasks that need this operation","When the workflow goal is to delete a Custom Script"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids, status, or asset URLs)."}]})
    .withHandler(handler)
}

/** Update Custom Script App Version */
export function indesign_update_script_app_version(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-update-script-app-version")
    .withInput(z.object({
  path: z.object({
  "script_name": z.string()
}),
  body: schemas.Schema_AppVersionUpdateRequest
}))
    .withOutput(z.object({
  "message": z.string().optional()
}))
    .withMetadata({"summary":"Update Custom Script App Version","description":"Updates the InDesign app version configuration for a registered custom script. Allows customers to specify version strategies: use latest version, fix to a major version, or fix to a specific major and minor version.","useCases":["Indesign Custom Scripts tasks that need this operation","When the workflow goal is to update Custom Script App Version"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids, status, or asset URLs)."}]})
    .withHandler(handler)
}

/** Get Current App Versions */
export function indesign_list_app_versions(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-list-app-versions")
    .withInput(z.object({}))
    .withOutput(z.array(schemas.Schema_AppVersionInfo))
    .withMetadata({"summary":"Get Current App Versions","description":"Retrieves information about all available InDesign app versions. Returns major version, minor version, and status for each registered app version.","useCases":["Indesign Custom Scripts tasks that need this operation","When the workflow goal is to get Current App Versions"],"projections":[{"summary":"Take listed items","description":"Keep each item id and display name from the list so later steps can select one."}]})
    .withHandler(handler)
}

/** Get document information */
export function indesign_get_document_info(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-get-document-info")
    .withInput(z.object({
  body: schemas.Schema_DocumentInfoRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_succeededEvent)
    .withMetadata({"summary":"Get document information","description":"Retrieve comprehensive information about INDD/IDML documents. Returns data based on the enabled information types specified in the request.","useCases":["Indesign Document Info tasks that need this operation","When the workflow goal is to get document information"],"projections":[{"summary":"Inspect the structured result","description":"Read the returned document or asset facts you need for authoring, such as names, sizes, and ids."}]})
    .withHandler(handler)
}

/** Get status - Document Info API */
export function indesign_get_document_info_job_status(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-get-document-info-job-status")
    .withInput(z.object({
  path: z.object({
  "document-info_job_id": z.string()
})
}))
    .withOutput(z.union([schemas.Schema_notstartedEvent, schemas.Schema_runningEvent, schemas.Schema_succeededEvent, schemas.Schema_failedEvent, schemas.Schema_partialSuccessEvent]))
    .withMetadata({"summary":"Get status - Document Info API","description":"Returns the latest status of a Document Info job. Poll this endpoint to retrieve the extracted document information including pages, links, fonts, page items, and text stories.","useCases":["Indesign Document Info tasks that need this operation","When the workflow goal is to get status - Document Info API"],"projections":[{"summary":"Read job status","description":"Take the job status and identifiers so you know whether to wait, retry, or continue."},{"summary":"Take completed outputs","description":"When the job succeeded, take output or result URLs and asset references for the next step."}]})
    .withHandler(handler)
}

/** Convert PDF to InDesign document */
export function indesign_convert_pdfto_in_design(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-convert-pdfto-in-design")
    .withInput(z.object({
  body: schemas.Schema_ConvertToInDesignRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_succeededEvent)
    .withMetadata({"summary":"Convert PDF to InDesign document","description":"Converts PDF documents to editable InDesign (INDD or IDML) format. The output is a ZIP file (default name 'output.zip') containing subfolders (named after each input PDF) with the converted document and associated assets. If `embedLinks` is false, assets are provided in a separate folder within the ZIP. If `embedLinks` is true, all links are embedded in the InDesign file. Returns warnings for missing fonts and links.","useCases":["Indesign Convert PDF to InDesign tasks that need this operation","When the workflow goal is to convert PDF to InDesign document"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids, status, or asset URLs)."}]})
    .withHandler(handler)
}

/** Get status - Convert PDF to InDesign API */
export function indesign_get_convert_pdfto_in_design_job_status(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-get-convert-pdfto-in-design-job-status")
    .withInput(z.object({
  path: z.object({
  "convert-pdf-to-indesign_job_id": z.string()
})
}))
    .withOutput(z.union([schemas.Schema_notstartedEvent, schemas.Schema_runningEvent, schemas.Schema_succeededEvent, schemas.Schema_failedEvent, schemas.Schema_partialSuccessEvent]))
    .withMetadata({"summary":"Get status - Convert PDF to InDesign API","description":"Returns the latest status of a job, in this case a PDF to InDesign conversion job. Poll this endpoint to retrieve the job results, warnings, and download URL of the output, in this case an output ZIP file.","useCases":["Indesign Convert PDF to InDesign tasks that need this operation","When the workflow goal is to get status - Convert PDF to InDesign API"],"projections":[{"summary":"Read job status","description":"Take the job status and identifiers so you know whether to wait, retry, or continue."},{"summary":"Take completed outputs","description":"When the job succeeded, take output or result URLs and asset references for the next step."}]})
    .withHandler(handler)
}

/** Get the status of a job */
export function indesign_get_job_status(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "indesign-get-job-status")
    .withInput(z.object({
  path: z.object({
  "id": z.string()
}),
  query: z.object({
  "size": z.number().int().min(1).optional(),
  "page": z.number().int().min(0).optional()
}).optional()
}))
    .withOutput(z.union([schemas.Schema_notstartedEvent, schemas.Schema_runningEvent, schemas.Schema_succeededEvent, schemas.Schema_failedEvent, schemas.Schema_partialSuccessEvent]))
    .withMetadata({"summary":"Get the status of a job","description":"Returns the latest status of an executed custom script job.","useCases":["Indesign Job Status tasks that need this operation","When the workflow goal is to get the status of a job"],"projections":[{"summary":"Read job status","description":"Take the job status and identifiers so you know whether to wait, retry, or continue."},{"summary":"Take completed outputs","description":"When the job succeeded, take output or result URLs and asset references for the next step."}]})
    .withHandler(handler)
}
