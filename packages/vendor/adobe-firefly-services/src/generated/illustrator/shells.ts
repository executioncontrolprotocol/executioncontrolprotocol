/* eslint-disable */
/** Generated Adobe illustrator capability shells — do not edit. */
import { capabilityFor, type CapabilityHandler } from "@executioncontrolprotocol/core"
import { z } from "zod"
import * as schemas from "./schemas.js"

const EXT_ID = "@executioncontrolprotocol/adobe-firefly-services"

/** Submit a Custom Script */
export function illustrator_register_custom_script_capability(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-register-custom-script-capability")
    .withInput(z.object({
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_CapabilityRegistrationResponse)
    .withMetadata({"summary":"Submit a Custom Script","description":"Submits Custom Script bundles for registration. Returns a URL for posting execution requests for the registered script.","useCases":["Illustrator Custom Scripts tasks that need this operation","When the workflow goal is to submit a Custom Script"],"samplePrompts":["Submit a Custom Script","Submit a Custom Script with Adobe Illustrator"]})
    .withHandler(handler)
}

/** Submit a custom script execution request */
export function illustrator_execute_custom_script_capability(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-execute-custom-script-capability")
    .withInput(z.object({
  path: z.object({
  "orgId": z.string(),
  "capabilityName": z.string()
}),
  body: schemas.Schema_CustomScriptExecuteRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_CustomScriptJobSucceededResponse)
    .withMetadata({"summary":"Submit a custom script execution request","description":"Submits execution requests for custom scripts. Defines input assets and parameters that the custom script will use during execution.","useCases":["Illustrator Custom Scripts tasks that need this operation","When the workflow goal is to submit a custom script execution request"],"samplePrompts":["Submit a custom script execution request","Submit a custom script execution request with Adobe Illustrator"]})
    .withHandler(handler)
}

/** Retrieve job status */
export function illustrator_custom_scripts_job_status(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-custom-scripts-job-status")
    .withInput(z.object({
  path: z.object({
  "jobId": z.string()
})
}))
    .withOutput(z.union([schemas.Schema_CustomScriptJobSucceededResponse, schemas.Schema_CustomScriptJobRunningResponse, schemas.Schema_CustomScriptJobFailedResponse]))
    .withMetadata({"summary":"Retrieve job status","description":"Poll execution status for a Custom Scripts job. Use this after calling custom script execute. When the job succeeds, each entry in `outputs` includes a presigned URL to download an output file.","useCases":["Illustrator Custom Scripts tasks that need this operation","When the workflow goal is to retrieve job status"],"samplePrompts":["Retrieve job status","Retrieve job status with Adobe Illustrator"]})
    .withHandler(handler)
}

/** Data merge */
export function illustrator_data_merge(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-data-merge")
    .withInput(z.object({
  body: schemas.Schema_DataMergeRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_DataMergeJobApiResponse)
    .withMetadata({"summary":"Data merge","description":"This endpoint allows you to merge variable data from a CSV file with an Adobe Illustrator template. The request is processed asynchronously and the status of the job can be checked using the status URL provided in the response. The output is provided as an array of individual files, one for each row in the CSV data. If some rows succeed and others fail or require rerun, the job completes with status `partially_succeeded` when you poll the status endpoint; that status applies only to Data Merge jobs.","useCases":["Illustrator Data Merge & Create Rendition tasks that need this operation","When the workflow goal is to data merge"],"samplePrompts":["Data merge","Data merge with Adobe Illustrator"]})
    .withHandler(handler)
}

/** Create rendition */
export function illustrator_create_rendition(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-create-rendition")
    .withInput(z.object({
  body: schemas.Schema_CreateRenditionRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_CreateRenditionJobApiResponse)
    .withMetadata({"summary":"Create rendition","description":"This endpoint allows you to convert Adobe Illustrator files into various output formats. It supports conversion of .ai documents into multiple web- and print-ready formats. The request is processed asynchronously and the status of the job can be checked using the status URL provided in the response. The output is provided as a single converted file.","useCases":["Illustrator Data Merge & Create Rendition tasks that need this operation","When the workflow goal is to create rendition"],"samplePrompts":["Create rendition","Create rendition with Adobe Illustrator"]})
    .withHandler(handler)
}

/** Submit a job */
export function illustrator_trace_image(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-trace-image")
    .withInput(z.object({
  body: schemas.Schema_VectorizeRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_ImageTraceJobApiResponse)
    .withMetadata({"summary":"Submit a job","description":"This endpoint allows you to convert a raster image (JPEG/PNG) into vector format (SVG). The request is processed asynchronously and the status of the job can be checked using the status URL provided in the response.","useCases":["Illustrator Image Trace tasks that need this operation","When the workflow goal is to submit a job"],"samplePrompts":["Submit a job","Submit a job with Adobe Illustrator"]})
    .withHandler(handler)
}

/** Retrieve job status */
export function illustrator_image_trace_job_status(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-image-trace-job-status")
    .withInput(z.object({
  path: z.object({
  "jobId": z.string()
})
}))
    .withOutput(z.union([schemas.Schema_ImageTraceJobApiResponse, schemas.Schema_JobStatusPollPayload, schemas.Schema_ImageTraceJobFailedResponse]))
    .withMetadata({"summary":"Retrieve job status","description":"Poll execution status for an Image Trace job. Use this after calling Image Trace. Poll `GET /v1/status/{jobId}` with the job ID from the trace-image response. When the job succeeds, each output item includes a presigned URL and SVG media type (`image/svg+xml`). Image Trace jobs return only `running`, `succeeded`, or `failed`.","useCases":["Illustrator Image Trace tasks that need this operation","When the workflow goal is to retrieve job status"],"samplePrompts":["Retrieve job status","Retrieve job status with Adobe Illustrator"]})
    .withHandler(handler)
}

/** Retrieve job status */
export function illustrator_facade_job_status(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-facade-job-status")
    .withInput(z.object({
  path: z.object({
  "jobId": z.string()
})
}))
    .withOutput(z.union([schemas.Schema_DataMergeJobApiResponse, schemas.Schema_CreateRenditionJobApiResponse, schemas.Schema_JobStatusPollPayload, schemas.Schema_DataMergeJobFailedResponse, schemas.Schema_DataMergeJobPartiallySucceededResponse]))
    .withMetadata({"summary":"Retrieve job status","description":"Retrieve the status of a job by providing the job ID. The job ID can be obtained from the response of other APIs. For all asynchronous jobs, polling this endpoint can return `running`, `succeeded`, or `failed`. The `partially_succeeded` status is returned only for Data Merge jobs when some CSV rows produce outputs while other rows fail or must be rerun after errors (for example, missing fonts). No other job types return the `partially_succeeded` status.When `status` is `succeeded`, for Data Merge jobs each item in `outputs` includes a `row` field; for Create Rendition jobs, output items contain `destination` and `mediaType` only.","useCases":["Illustrator Data Merge & Create Rendition tasks that need this operation","When the workflow goal is to retrieve job status"],"samplePrompts":["Retrieve job status","Retrieve job status with Adobe Illustrator"]})
    .withHandler(handler)
}
