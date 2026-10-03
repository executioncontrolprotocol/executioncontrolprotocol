/* eslint-disable */
/** Generated Adobe creative-production capability shells — do not edit. */
import { capabilityFor, type CapabilityHandler } from "@executioncontrolprotocol/core"
import { z } from "zod"
import * as schemas from "./schemas.js"

const EXT_ID = "@executioncontrolprotocol/adobe-firefly-services"

/** Execute a batch of assets through a workflow */
export function creative_production_batch_execute(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "creative-production-batch-execute")
    .withInput(z.object({
  headers: z.object({
  "api-version": z.enum(["1.0"]).optional()
}).optional(),
  body: schemas.Schema_BatchExecuteRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_BatchStatusResponse)
    .withMetadata({"summary":"Execute a batch of assets through a workflow","description":"Start a new batch job to process multiple assets through a published workflow. The request body supplies the workflow identifier and `inputs`: a list of runs, where each run is an array of node input mappings (`node_id` plus `content` and/or `template`). Each run is processed separately through the workflow in parallel. Returns a `batchId` and `links` that can be used to track progress and retrieve results.","useCases":["Creative Production Batches tasks that need this operation","When the workflow goal is to execute a batch of assets through a workflow"],"samplePrompts":["Execute a batch of assets through a workflow","Execute a batch of assets through a workflow with Adobe Creative Production"]})
    .withHandler(handler)
}

/** List batches */
export function creative_production_list_batches(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "creative-production-list-batches")
    .withInput(z.object({
  query: z.object({
  "status": z.enum(["pending", "running", "completed", "failed", "cancelled"]).optional(),
  "workflowId": z.string().optional(),
  "createdAfter": z.string().optional(),
  "createdBefore": z.string().optional(),
  "limit": z.number().int().min(1).max(100).optional(),
  "offset": z.number().int().min(0).optional()
}).optional(),
  headers: z.object({
  "api-version": z.enum(["1.0"]).optional()
}).optional()
}))
    .withOutput(schemas.Schema_ListBatchesResponse)
    .withMetadata({"summary":"List batches","description":"List all batches created by the authenticated user within their organization. Results are automatically filtered by the authenticated user's ID. Users can only view their own batches, not batches created by other users in the organization. Results are sorted by creation date (most recent first) and include pagination metadata.","useCases":["Creative Production Batches tasks that need this operation","When the workflow goal is to list batches"],"samplePrompts":["List batches","List batches with Adobe Creative Production"]})
    .withHandler(handler)
}

/** Get batch status */
export function creative_production_get_batch_status(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "creative-production-get-batch-status")
    .withInput(z.object({
  path: z.object({
  "batchId": z.string()
}),
  headers: z.object({
  "api-version": z.enum(["1.0"]).optional()
}).optional()
}))
    .withOutput(schemas.Schema_BatchStatusResponse)
    .withMetadata({"summary":"Get batch status","description":"Get the current status and progress of a batch job. Returns the batch identifier, workflow identifier, status, asset and execution counters (including execution IDs), timestamps, and hypermedia links to cancel or list executions.","useCases":["Creative Production Batches tasks that need this operation","When the workflow goal is to get batch status"],"samplePrompts":["Get batch status","Get batch status with Adobe Creative Production"]})
    .withHandler(handler)
}

/** Cancel a batch */
export function creative_production_cancel_batch(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "creative-production-cancel-batch")
    .withInput(z.object({
  path: z.object({
  "batchId": z.string()
}),
  headers: z.object({
  "api-version": z.enum(["1.0"]).optional()
}).optional()
}))
    .withOutput(z.object({
  "batchId": z.string().optional(),
  "status": z.enum(["cancelled"]).optional(),
  "message": z.string().optional(),
  "previousStatus": z.string().optional(),
  "assets": schemas.Schema_BatchAssetCounts.optional()
}))
    .withMetadata({"summary":"Cancel a batch","description":"Cancel a batch job that is currently pending or running. Once cancelled, no new assets will be processed. Assets currently being processed may complete. The batch status will be updated to 'cancelled'. Cannot cancel batches that are already completed, failed, or cancelled.","useCases":["Creative Production Batches tasks that need this operation","When the workflow goal is to cancel a batch"],"samplePrompts":["Cancel a batch","Cancel a batch with Adobe Creative Production"]})
    .withHandler(handler)
}

/** List individual execution results */
export function creative_production_list_batch_executions(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "creative-production-list-batch-executions")
    .withInput(z.object({
  path: z.object({
  "batchId": z.string()
}),
  query: z.object({
  "status": z.enum(["pending", "running", "success", "failed"]).optional(),
  "limit": z.number().int().min(1).max(500).optional(),
  "offset": z.number().int().min(0).optional()
}).optional(),
  headers: z.object({
  "api-version": z.enum(["1.0"]).optional()
}).optional()
}))
    .withOutput(z.object({
  "batchId": z.string().optional(),
  "total": z.number().int().optional(),
  "executions": z.array(schemas.Schema_BatchExecutionResult).optional(),
  "pagination": z.object({
  "limit": z.number().int().optional(),
  "offset": z.number().int().optional(),
  "count": z.number().int().optional(),
  "hasMore": z.boolean().optional()
}).optional()
}))
    .withMetadata({"summary":"List individual execution results","description":"List all individual asset execution results within a batch, with optional filtering. Returns detailed results for each asset including: - Execution status (pending, running, success, failed) - Input asset data - Output results (if successful) - Error messages (if failed) - Timing information The response supports pagination and filtering by execution status.","useCases":["Creative Production Batches tasks that need this operation","When the workflow goal is to list individual execution results"],"samplePrompts":["List individual execution results","List individual execution results with Adobe Creative Production"]})
    .withHandler(handler)
}
