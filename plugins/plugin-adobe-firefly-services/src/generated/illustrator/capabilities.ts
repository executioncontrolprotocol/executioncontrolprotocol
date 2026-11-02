/* eslint-disable */
/** Generated Adobe illustrator capabilities — do not edit. */
import * as shells from "./shells.js"
import * as schemas from "./schemas.js"
import { invokeAdobeOperation } from "../../runtime/invoke.js"

/** Submit a Custom Script */
export const illustrator_register_custom_script_capability = shells.illustrator_register_custom_script_capability(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/run-scripts",
    baseUrl: "https://illustrator.adobe.io/",
    input: input as Record<string, unknown>,
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
    input: input as Record<string, unknown>,
    parameters: {"path":["orgId","capabilityName"],"body":["assets","params"]},
    bodySchema: schemas.Schema_CustomScriptExecuteRequest,
    ctx,
    outputSchema: schemas.Schema_CustomScriptJobSucceededResponse,
    asyncMode: "submit",
  })
})

/** Data merge */
export const illustrator_data_merge = shells.illustrator_data_merge(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/merge-data",
    baseUrl: "https://illustrator-api.adobe.io/",
    input: input as Record<string, unknown>,
    parameters: {"body":["data","template","fontFiles","settings","output"]},
    bodySchema: schemas.Schema_DataMergeRequest,
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
    input: input as Record<string, unknown>,
    parameters: {"body":["input","output","settings"]},
    bodySchema: schemas.Schema_CreateRenditionRequest,
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
    input: input as Record<string, unknown>,
    parameters: {"body":["input","settings"]},
    bodySchema: schemas.Schema_VectorizeRequest,
    ctx,
    outputSchema: schemas.Schema_ImageTraceJobApiResponse,
    asyncMode: "submit",
  })
})
