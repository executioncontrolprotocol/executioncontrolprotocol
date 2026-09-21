/* eslint-disable */
/** Generated from express/ffs-express-api.json — do not edit. */
import { z } from "zod"

export const Schema_TaggedDocumentsSortBy: z.ZodTypeAny = z.lazy(() => (z.enum(["+modifiedDate", "+name", "-modifiedDate", "-name", "-relevance", "modifiedDate", "name", "relevance"])))

export const Schema_TaggedDocumentsResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "paging": Schema_Pagination.optional(),
  "documents": z.array(Schema_ExpressDocument).optional()
})))

export const Schema_Pagination: z.ZodTypeAny = z.lazy(() => (z.object({
  "nextUrl": z.string(),
  "totalRecords": z.number()
})))

export const Schema_ExpressDocument: z.ZodTypeAny = z.lazy(() => (z.object({
  "id": z.string(),
  "name": z.string(),
  "thumbnailUrl": z.string()
})))

export const Schema_ErrorResponseDetails: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": z.string(),
  "message": z.string().optional(),
  "validation_errors": z.array(z.string()).optional()
})))

export const Schema_TaggedDocumentDetailsResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "name": z.string(),
  "id": z.string(),
  "paging": Schema_Pagination.optional(),
  "documentPages": z.array(Schema_DocumentPageDetails)
})))

export const Schema_DocumentPageDetails: z.ZodTypeAny = z.lazy(() => (z.object({
  "pageNumber": z.number(),
  "pageTitle": z.string(),
  "thumbnailUrl": z.string(),
  "size": Schema_Size,
  "taggedElements": z.array(Schema_TaggedElement).optional()
})))

export const Schema_Size: z.ZodTypeAny = z.lazy(() => (z.object({
  "width": z.number(),
  "height": z.number()
})))

export const Schema_TaggedElement: z.ZodTypeAny = z.lazy(() => (z.object({
  "name": z.string(),
  "type": Schema_TaggedElementType,
  "position": Schema_Point,
  "size": Schema_Size
})))

export const Schema_TaggedElementType: z.ZodTypeAny = z.lazy(() => (z.enum(["image", "text", "video"])))

export const Schema_Point: z.ZodTypeAny = z.lazy(() => (z.object({
  "x": z.number(),
  "y": z.number()
})))

export const Schema_GenerateVariationRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "id": z.string(),
  "variationDetails": Schema_VariationDetails
})))

export const Schema_VariationDetails: z.ZodTypeAny = z.lazy(() => (z.object({
  "tagMappings": z.record(z.string(), z.string()),
  "pages": z.string().optional(),
  "preferredDocumentName": z.string().optional(),
  "projectId": z.string().optional()
})))

export const Schema_JobResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "statusUrl": z.string()
})))

export const Schema_ExportRenditionRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "id": z.string(),
  "pages": z.string().optional(),
  "options": z.union([Schema_ImageRenditionOptions, Schema_VideoRenditionOptions, Schema_PdfRenditionOptions])
})))

export const Schema_ImageRenditionOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "format": Schema_ImageRenditionFormat,
  "size": z.number().optional()
})))

export const Schema_ImageRenditionFormat: z.ZodTypeAny = z.lazy(() => (z.enum(["image/jpeg", "image/png"])))

export const Schema_VideoRenditionOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "format": z.enum(["video/mp4"]),
  "size": z.number().optional()
})))

export const Schema_PdfRenditionOptions: z.ZodTypeAny = z.lazy(() => (z.object({
  "format": z.enum(["application/pdf"]),
  "pdfType": z.enum(["print", "standard"]).optional(),
  "downloadIndividualPdfFiles": z.boolean().optional(),
  "config": z.union([Schema_PrintConfig, Schema_StandardConfig]).optional()
})))

export const Schema_PrintConfig: z.ZodTypeAny = z.lazy(() => (z.object({
  "bleed": z.boolean().optional(),
  "bleedSettings": Schema_ValueWithUnit.optional(),
  "cropMargins": z.boolean().optional(),
  "cropMarginsSettings": Schema_ValueWithUnit.optional()
})))

export const Schema_ValueWithUnit: z.ZodTypeAny = z.lazy(() => (z.object({
  "amount": z.number(),
  "unit": Schema_PdfMarginUnit
})))

export const Schema_PdfMarginUnit: z.ZodTypeAny = z.lazy(() => (z.enum(["in", "mm"])))

export const Schema_StandardConfig: z.ZodTypeAny = z.lazy(() => (z.object({
  "accessibilityTags": z.boolean().optional()
})))

export const Schema_JobStatusResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "status": Schema_JobStatus
})))

export const Schema_JobStatus: z.ZodTypeAny = z.lazy(() => (z.enum(["cancel_requested", "cancelled", "failed", "partially_succeeded", "pending", "running", "succeeded"])))

export const Schema_ExportRenditionResponse: z.ZodTypeAny = z.lazy(() => (z.union([Schema_PageRenditionResponse, Schema_PdfRenditionResponse])))

export const Schema_PageRenditionResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "id": z.string(),
  "pageRenditionsResult": z.array(z.union([Schema_SuccessfulPageRendition, Schema_FailedPageRendition])),
  "jobId": z.string(),
  "status": Schema_JobStatus
})))

export const Schema_SuccessfulPageRendition: z.ZodTypeAny = z.lazy(() => (z.object({
  "pageNumber": z.number(),
  "renditionUrl": z.string()
})))

export const Schema_FailedPageRendition: z.ZodTypeAny = z.lazy(() => (z.object({
  "pageNumber": z.number(),
  "error": Schema_ErrorResponseDetails
})))

export const Schema_PdfRenditionResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "id": z.string(),
  "pageRenditionsResult": z.array(z.union([Schema_SuccessfulPdfRendition, Schema_FailedPdfRendition])),
  "jobId": z.string(),
  "status": Schema_JobStatus
})))

export const Schema_SuccessfulPdfRendition: z.ZodTypeAny = z.lazy(() => (z.object({
  "renditionUrl": z.string()
})))

export const Schema_FailedPdfRendition: z.ZodTypeAny = z.lazy(() => (z.object({
  "error": Schema_ErrorResponseDetails
})))

export const Schema_GenerateVariationResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "document": Schema_ExpressDocument,
  "jobId": z.string(),
  "status": Schema_JobStatus
})))
