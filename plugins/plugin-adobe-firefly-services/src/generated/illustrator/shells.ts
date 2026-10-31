/* eslint-disable */
/** Generated Adobe illustrator capability shells — do not edit. */
import { capabilityFor, type CapabilityHandler } from "@executioncontrolprotocol/core"
import { z } from "zod"
import * as schemas from "./schemas.js"

const EXT_ID = "@executioncontrolprotocol/adobe-firefly-services"

/** Submit a Custom Script */
export function illustrator_register_custom_script_capability(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-register-custom-script-capability")
    .withInput(z.object({}))
    .withOutput(schemas.Schema_CapabilityRegistrationResponse)
    .withMetadata({"summary":"Submit a Custom Script","description":"Submits Custom Script bundles for registration. Returns a URL for posting execution requests for the registered script.","useCases":["Illustrator Custom Scripts tasks that need this operation","When the workflow goal is to submit a Custom Script"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}

/** Submit a custom script execution request */
export function illustrator_execute_custom_script_capability(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-execute-custom-script-capability")
    .withInput(z.object({
  orgId: z.string(),
  capabilityName: z.string(),
  assets: z.array(z.object({
  "source": z.object({
  "url": z.string()
}),
  "destination": z.string()
})).optional(),
  params: z.object({
  "targetDocument": z.string(),
  "outputFolderPath": z.string(),
  "zip": z.string().optional(),
  "fontFolderPath": z.string().optional()
}).optional(),
  body: schemas.Schema_CustomScriptExecuteRequest.optional()
}))
    .withOutput(schemas.Schema_CustomScriptJobSucceededResponse)
    .withMetadata({"summary":"Submit a custom script execution request","description":"Submits execution requests for custom scripts. Defines input assets and parameters that the custom script will use during execution.","useCases":["Illustrator Custom Scripts tasks that need this operation","When the workflow goal is to submit a custom script execution request"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}

/** Data merge */
export function illustrator_data_merge(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-data-merge")
    .withInput(z.object({
  data: schemas.Schema_DataMergeData.optional(),
  template: schemas.Schema_DataMergeTemplate.optional(),
  fontFiles: z.array(schemas.Schema_DataMergeFontFile).optional(),
  settings: schemas.Schema_DataMergeSettings.optional(),
  output: schemas.Schema_DataMergeOutputSpec.optional(),
  body: schemas.Schema_DataMergeRequest.optional()
}))
    .withOutput(schemas.Schema_DataMergeJobApiResponse)
    .withMetadata({"summary":"Data merge","description":"This endpoint allows you to merge variable data from a CSV file with an Adobe Illustrator template. The request is processed asynchronously and the status of the job can be checked using the status URL provided in the response. The output is provided as an array of individual files, one for each row in the CSV data. If some rows succeed and others fail or require rerun, the job completes with status `partially_succeeded` when you poll the status endpoint; that status applies only to Data Merge jobs.","useCases":["Illustrator Data Merge & Create Rendition tasks that need this operation","When the workflow goal is to data merge"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}

/** Create rendition */
export function illustrator_create_rendition(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-create-rendition")
    .withInput(z.object({
  input: schemas.Schema_CreateRenditionInput.optional(),
  output: schemas.Schema_CreateRenditionOutputSpec.optional(),
  settings: schemas.Schema_CreateRenditionSettings.optional(),
  body: schemas.Schema_CreateRenditionRequest.optional()
}))
    .withOutput(schemas.Schema_CreateRenditionJobApiResponse)
    .withMetadata({"summary":"Create rendition","description":"This endpoint allows you to convert Adobe Illustrator files into various output formats. It supports conversion of .ai documents into multiple web- and print-ready formats. The request is processed asynchronously and the status of the job can be checked using the status URL provided in the response. The output is provided as a single converted file.","useCases":["Illustrator Data Merge & Create Rendition tasks that need this operation","When the workflow goal is to create rendition"],"projections":[{"summary":"Take returned assets","description":"Keep asset URLs or output references from the result for download or the next edit step."}]})
    .withHandler(handler)
}

/** Submit a job */
export function illustrator_trace_image(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "illustrator-trace-image")
    .withInput(z.object({
  input: schemas.Schema_VectorizeInput.optional(),
  settings: schemas.Schema_VectorizeSettings.optional(),
  body: schemas.Schema_VectorizeRequest.optional()
}))
    .withOutput(schemas.Schema_ImageTraceJobApiResponse)
    .withMetadata({"summary":"Submit a job","description":"This endpoint allows you to convert a raster image (JPEG/PNG) into vector format (SVG). The request is processed asynchronously and the status of the job can be checked using the status URL provided in the response.","useCases":["Illustrator Image Trace tasks that need this operation","When the workflow goal is to submit a job"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}
