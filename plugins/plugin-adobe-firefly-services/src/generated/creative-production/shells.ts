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
  "api-version": z.enum(["1.0"]).optional(),
  workflow: schemas.Schema_BatchExecuteWorkflow.optional(),
  body: schemas.Schema_BatchExecuteRequest.optional()
}))
    .withOutput(schemas.Schema_BatchStatusResponse)
    .withMetadata({"summary":"Execute a batch of assets through a workflow","description":"Start a new batch job to process multiple assets through a published workflow. The request body supplies the workflow identifier and `inputs`: a list of runs, where each run is an array of node input mappings (`node_id` plus `content` and/or `template`). Each run is processed separately through the workflow in parallel. Returns a `batchId` and `links` that can be used to track progress and retrieve results.","useCases":["Creative Production Batches tasks that need this operation","When the workflow goal is to execute a batch of assets through a workflow"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}

/** List batches */
export function creative_production_list_batches(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "creative-production-list-batches")
    .withInput(z.object({
  "api-version": z.enum(["1.0"]).optional(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]).optional(),
  workflowId: z.string().optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional()
}))
    .withOutput(schemas.Schema_ListBatchesResponse)
    .withMetadata({"summary":"List batches","description":"List all batches created by the authenticated user within their organization. Results are automatically filtered by the authenticated user's ID. Users can only view their own batches, not batches created by other users in the organization. Results are sorted by creation date (most recent first) and include pagination metadata.","useCases":["Creative Production Batches tasks that need this operation","When the workflow goal is to list batches"],"projections":[{"summary":"Take listed items","description":"Keep each item id and display name from the list so later steps can select one."}]})
    .withHandler(handler)
}

/** List individual execution results */
export function creative_production_list_batch_executions(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "creative-production-list-batch-executions")
    .withInput(z.object({
  "api-version": z.enum(["1.0"]).optional(),
  batchId: z.string(),
  status: z.enum(["pending", "running", "success", "failed"]).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional()
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
    .withMetadata({"summary":"List individual execution results","description":"List all individual asset execution results within a batch, with optional filtering. Returns detailed results for each asset including: - Execution status (pending, running, success, failed) - Input asset data - Output results (if successful) - Error messages (if failed) - Timing information The response supports pagination and filtering by execution status.","useCases":["Creative Production Batches tasks that need this operation","When the workflow goal is to list individual execution results"],"projections":[{"summary":"Take listed items","description":"Keep each item id and display name from the list so later steps can select one."}]})
    .withHandler(handler)
}
