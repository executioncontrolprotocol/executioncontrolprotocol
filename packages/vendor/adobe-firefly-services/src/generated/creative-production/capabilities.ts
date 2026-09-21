/* eslint-disable */
/** Generated Adobe creative-production capabilities — do not edit. */
import * as shells from "./shells.js"
import { z } from "zod"
import * as schemas from "./schemas.js"
import { invokeAdobeOperation } from "../../runtime/invoke.js"

/** Execute a batch of assets through a workflow */
export const creative_production_batch_execute = shells.creative_production_batch_execute(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/batch/execute",
    baseUrl: "https://run-workflow.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_BatchStatusResponse,
    asyncMode: "submit",
  })
})

/** List batches */
export const creative_production_list_batches = shells.creative_production_list_batches(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/batches",
    baseUrl: "https://run-workflow.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_ListBatchesResponse,
    asyncMode: "none",
  })
})

/** Get batch status */
export const creative_production_get_batch_status = shells.creative_production_get_batch_status(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/batch/{batchId}/status",
    baseUrl: "https://run-workflow.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_BatchStatusResponse,
    asyncMode: "none",
  })
})

/** Cancel a batch */
export const creative_production_cancel_batch = shells.creative_production_cancel_batch(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/batch/{batchId}/cancel",
    baseUrl: "https://run-workflow.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.object({
  "batchId": z.string().optional(),
  "status": z.enum(["cancelled"]).optional(),
  "message": z.string().optional(),
  "previousStatus": z.string().optional(),
  "assets": schemas.Schema_BatchAssetCounts.optional()
}),
    asyncMode: "none",
  })
})

/** List individual execution results */
export const creative_production_list_batch_executions = shells.creative_production_list_batch_executions(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/batch/{batchId}/executions",
    baseUrl: "https://run-workflow.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.object({
  "batchId": z.string().optional(),
  "total": z.number().int().optional(),
  "executions": z.array(schemas.Schema_BatchExecutionResult).optional(),
  "pagination": z.object({
  "limit": z.number().int().optional(),
  "offset": z.number().int().optional(),
  "count": z.number().int().optional(),
  "hasMore": z.boolean().optional()
}).optional()
}),
    asyncMode: "none",
  })
})
