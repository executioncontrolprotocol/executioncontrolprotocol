/* eslint-disable */
/** Generated from creative-production/workflow-builder-api.yaml — do not edit. */
import { z } from "zod"

export const Schema_BatchExecuteRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "workflow": Schema_BatchExecuteWorkflow
})))

export const Schema_BatchExecuteWorkflow: z.ZodTypeAny = z.lazy(() => (z.object({
  "workflowId": z.string(),
  "inputs": z.array(z.array(Schema_BatchWorkflowNodeInput))
})))

export const Schema_BatchWorkflowNodeInput: z.ZodTypeAny = z.lazy(() => (z.union([Schema_BatchNodeInputContentAssets, Schema_BatchNodeInputContentText, Schema_BatchNodeInputTemplate])))

export const Schema_BatchNodeInputContentAssets: z.ZodTypeAny = z.lazy(() => (z.object({
  "node_id": z.string(),
  "content": z.array(Schema_PresignedStorageRef)
})))

export const Schema_PresignedStorageRef: z.ZodTypeAny = z.lazy(() => (z.object({
  "presignedUrl": z.string(),
  "storageType": z.string().optional()
})))

export const Schema_BatchNodeInputContentText: z.ZodTypeAny = z.lazy(() => (z.object({
  "node_id": z.string(),
  "content": z.string()
})))

export const Schema_BatchNodeInputTemplate: z.ZodTypeAny = z.lazy(() => (z.object({
  "node_id": z.string(),
  "template": Schema_PresignedStorageRef
})))

export const Schema_BatchExecuteAcceptedResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "batchId": z.string(),
  "workflowId": z.string(),
  "status": z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  "assets": Schema_BatchAssetCounts,
  "createdAt": z.string(),
  "links": Schema_BatchExecuteLinks
})))

export const Schema_BatchAssetCounts: z.ZodTypeAny = z.lazy(() => (z.object({
  "total": z.number().int().optional(),
  "pending": z.number().int().optional(),
  "processing": z.number().int().optional(),
  "completed": z.number().int().optional(),
  "failed": z.number().int().optional()
})))

export const Schema_BatchExecuteLinks: z.ZodTypeAny = z.lazy(() => (z.object({
  "result": Schema_BatchHrefLink,
  "status": Schema_BatchHrefLink,
  "cancel": Schema_BatchHrefLink,
  "executions": Schema_BatchHrefLink
})))

export const Schema_BatchHrefLink: z.ZodTypeAny = z.lazy(() => (z.object({
  "href": z.string()
})))

export const Schema_BatchStatusDetailLinks: z.ZodTypeAny = z.lazy(() => (z.object({
  "cancel": Schema_BatchHrefLink,
  "executions": Schema_BatchHrefLink
})))

export const Schema_ErrorResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "error": z.string().optional(),
  "message": z.string().optional(),
  "status": z.enum(["failed", "error"]).optional()
})))

export const Schema_BatchConfig: z.ZodTypeAny = z.lazy(() => (z.object({
  "concurrencyLimit": z.number().int().min(1).max(100).optional(),
  "priority": z.enum(["HIGH", "NORMAL", "LOW"]).optional(),
  "continueOnError": z.boolean().optional(),
  "webhookUrl": z.string().optional()
})))

export const Schema_ListBatchesResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "orgId": z.string(),
  "batches": z.array(Schema_BatchListItem).optional(),
  "pagination": Schema_BatchListPagination,
  "filters": z.object({
  "status": z.string().optional(),
  "workflowId": z.string().optional(),
  "createdAfter": z.string().optional(),
  "createdBefore": z.string().optional()
}).optional()
})))

export const Schema_BatchListItem: z.ZodTypeAny = z.lazy(() => (z.object({
  "batchId": z.string(),
  "workflowId": z.string(),
  "jobName": z.string(),
  "status": z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  "assets": Schema_BatchAssetCounts,
  "executions": Schema_BatchExecutionsSummary,
  "endpoint": z.enum(["batch", "preview", "execute"]),
  "createdAt": z.string(),
  "updatedAt": z.string(),
  "completedAt": z.string().nullable().optional()
})))

export const Schema_BatchExecutionsSummary: z.ZodTypeAny = z.lazy(() => (z.object({
  "total": z.number().int(),
  "completed": z.number().int(),
  "failed": z.number().int(),
  "allExecutionIds": z.array(z.string()),
  "failedExecutionIds": z.array(z.string())
})))

export const Schema_BatchListPagination: z.ZodTypeAny = z.lazy(() => (z.object({
  "limit": z.number().int(),
  "offset": z.number().int(),
  "count": z.number().int(),
  "hasMore": z.boolean()
})))

export const Schema_BatchStatusResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "batchId": z.string(),
  "workflowId": z.string(),
  "status": z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  "assets": Schema_BatchAssetCounts,
  "executions": Schema_BatchExecutionsSummary,
  "createdAt": z.string(),
  "updatedAt": z.string(),
  "completedAt": z.string().nullable().optional(),
  "links": Schema_BatchStatusDetailLinks
})))

export const Schema_BatchExecutionResult: z.ZodTypeAny = z.lazy(() => (z.object({
  "executionId": z.string().optional(),
  "batchId": z.string().optional(),
  "assetIndex": z.number().int().optional(),
  "inputAsset": z.object({
  "index": z.number().int().optional(),
  "assetId": z.string().optional(),
  "inputs": z.array(z.object({})).optional()
}).optional(),
  "status": z.enum(["pending", "running", "success", "failed"]).optional(),
  "error": z.string().optional(),
  "outputs": z.array(z.object({})).optional(),
  "startedAt": z.string().optional(),
  "completedAt": z.string().optional(),
  "durationMs": z.number().int().optional()
})))
