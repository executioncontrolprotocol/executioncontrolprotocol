/* eslint-disable */
/** Generated from illustrator/illustrator-api-beta.json, illustrator/illustrator-api.json — do not edit. */
import { z } from "zod"

export const Schema_CapabilityRegistrationResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string(),
  "capability": z.string(),
  "version": z.string()
}).strict()))

export const Schema_CustomScriptExecuteRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "assets": z.array(z.object({
  "source": z.object({
  "url": z.string()
}).strict(),
  "destination": z.string()
}).strict()),
  "params": z.object({
  "targetDocument": z.string(),
  "outputFolderPath": z.string(),
  "zip": z.string().optional(),
  "fontFolderPath": z.string().optional()
}).strict().optional()
}).strict()))

export const Schema_CustomScriptExecuteResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "statusUrl": z.string()
}).strict()))

export const Schema_CustomScriptJobConversionDetails: z.ZodTypeAny = z.lazy(() => (z.object({
  "inputFile": z.string().optional(),
  "outputFolderPath": z.string().optional(),
  "success": z.boolean().optional()
}).strict()))

export const Schema_CustomScriptOutputItem: z.ZodTypeAny = z.lazy(() => (z.object({
  "destination": z.object({
  "url": z.string()
}).strict(),
  "source": z.string()
}).strict()))

export const Schema_CustomScriptJobSucceededResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "timestamp": z.string(),
  "status": z.enum(["succeeded"]),
  "data": z.object({
  "conversionDetails": Schema_CustomScriptJobConversionDetails.optional()
}).strict().optional(),
  "outputs": z.array(Schema_CustomScriptOutputItem)
}).strict()))

export const Schema_CustomScriptJobRunningResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "timestamp": z.string(),
  "status": z.enum(["running"])
}).strict()))

export const Schema_CustomScriptJobFailedResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "timestamp": z.string(),
  "status": z.enum(["failed"]),
  "errors": z.array(z.object({
  "message": z.string().optional()
}).strict())
}).strict()))

export const Schema_CustomScriptJobNotFoundResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "message": z.string().optional(),
  "errorCode": z.string().optional()
}).strict()))

export const Schema_CustomScriptApiError: z.ZodTypeAny = z.lazy(() => (z.object({
  "message": z.string(),
  "error_code": z.string()
}).strict()))

export const Schema_DataMergeSourceUrl: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string()
}).strict()))

export const Schema_DataMergeData: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_DataMergeSourceUrl
}).strict()))

export const Schema_DataMergeTemplate: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_DataMergeSourceUrl
}).strict()))

export const Schema_DataMergeFontFileMediaType: z.ZodTypeAny = z.lazy(() => (z.enum(["font/ttf", "font/otf"])))

export const Schema_DataMergeFontFile: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_DataMergeSourceUrl,
  "mediaType": Schema_DataMergeFontFileMediaType
}).strict()))

export const Schema_DataMergeFontSettings: z.ZodTypeAny = z.lazy(() => (z.object({
  "autoReduceFontSizeToFit": z.boolean().optional(),
  "minFontSize": z.number().optional(),
  "fallBackFont": z.string().optional()
}).strict()))

export const Schema_DataMergeSettings: z.ZodTypeAny = z.lazy(() => (z.object({
  "fontSettings": Schema_DataMergeFontSettings.optional()
}).strict()))

export const Schema_DataMergeOutputMediaType: z.ZodTypeAny = z.lazy(() => (z.enum(["image/png", "image/jpeg", "application/pdf", "image/svg+xml", "application/illustrator", "application/eps"])))

export const Schema_DataMergeOutputSpec: z.ZodTypeAny = z.lazy(() => (z.object({
  "fileName": z.string(),
  "mediaType": Schema_DataMergeOutputMediaType
}).strict()))

export const Schema_DataMergeRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "data": Schema_DataMergeData,
  "template": Schema_DataMergeTemplate,
  "fontFiles": z.array(Schema_DataMergeFontFile).optional(),
  "settings": Schema_DataMergeSettings.optional(),
  "output": Schema_DataMergeOutputSpec
}).strict()))

export const Schema_JobLinkResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "statusUrl": z.string()
}).strict()))

export const Schema_JobError: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": z.string(),
  "message": z.string().optional(),
  "validation_errors": z.array(z.string()).optional()
}).strict()))

export const Schema_UnauthorizedError: z.ZodTypeAny = z.lazy(() => (z.object({
  "title": z.string().optional(),
  "status": z.number().int(),
  "error_code": z.number().int(),
  "message": z.string().optional()
}).strict()))

export const Schema_ForbiddenError: z.ZodTypeAny = z.lazy(() => (z.object({
  "title": z.string().optional(),
  "status": z.number().int(),
  "error_code": z.number().int(),
  "message": z.string().optional()
}).strict()))

export const Schema_LongJobError: z.ZodTypeAny = z.lazy(() => (z.object({
  "title": z.string().optional(),
  "status": z.number().int(),
  "error_code": z.number().int(),
  "message": z.string().optional()
}).strict()))

export const Schema_JobStatus: z.ZodTypeAny = z.lazy(() => (z.enum(["running", "failed", "succeeded"])))

export const Schema_DataMergeOutputDestination: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string()
}).strict()))

export const Schema_DataMergeJobApiResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "status": z.enum(["succeeded"]),
  "jobId": z.string(),
  "outputs": z.array(Schema_DataMergeOutputWithRow)
}).strict()))

export const Schema_DataMergeOutputWithRow: z.ZodTypeAny = z.lazy(() => (z.object({
  "row": z.number().int(),
  "destination": Schema_DataMergeOutputDestination,
  "mediaType": z.string()
}).strict()))

export const Schema_JobStatusPollPayload: z.ZodTypeAny = z.lazy(() => (z.object({
  "status": z.intersection(Schema_JobStatus, z.enum(["running"])),
  "jobId": z.string(),
  "Retry-After": z.string()
}).strict()))

export const Schema_DataMergeJobFailedResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "status": z.enum(["failed"]),
  "error_code": z.string(),
  "message": z.string()
}).strict()))

export const Schema_DataMergeRowRange: z.ZodTypeAny = z.lazy(() => (z.object({
  "start": z.number().int(),
  "end": z.number().int()
}).strict()))

export const Schema_DataMergeNeedsRerunItem: z.ZodTypeAny = z.lazy(() => (z.object({
  "rowRange": Schema_DataMergeRowRange
}).strict()))

export const Schema_DataMergePartialSuccessError: z.ZodTypeAny = z.lazy(() => (z.object({
  "row": z.number().int(),
  "error_code": z.string(),
  "message": z.string()
}).strict()))

export const Schema_DataMergeJobPartiallySucceededResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "status": z.enum(["partially_succeeded"]),
  "outputs": z.array(Schema_DataMergeOutputWithRow),
  "errors": z.array(Schema_DataMergePartialSuccessError),
  "needsRerun": z.array(Schema_DataMergeNeedsRerunItem)
}).strict()))

export const Schema_CreateRenditionSourceUrl: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string()
}).strict()))

export const Schema_CreateRenditionSourceMediaType: z.ZodTypeAny = z.lazy(() => (z.enum(["application/illustrator"])))

export const Schema_CreateRenditionInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_CreateRenditionSourceUrl,
  "mediaType": Schema_CreateRenditionSourceMediaType.optional()
}).strict()))

export const Schema_CreateRenditionOutputMediaType: z.ZodTypeAny = z.lazy(() => (z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "application/pdf", "application/eps"])))

export const Schema_CreateRenditionOutputSpec: z.ZodTypeAny = z.lazy(() => (z.object({
  "mediaType": Schema_CreateRenditionOutputMediaType
}).strict()))

export const Schema_CreateRenditionSettings: z.ZodTypeAny = z.lazy(() => (z.object({
  "documentLevel": z.union([z.literal(0), z.literal(1)]),
  "artboardRange": z.string().optional(),
  "resolution": z.number().min(4).max(2400).optional()
}).strict()))

export const Schema_CreateRenditionRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "input": Schema_CreateRenditionInput,
  "output": Schema_CreateRenditionOutputSpec,
  "settings": Schema_CreateRenditionSettings
}).strict()))

export const Schema_CreateRenditionOutputDestination: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string()
}).strict()))

export const Schema_CreateRenditionOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "destination": Schema_CreateRenditionOutputDestination,
  "mediaType": z.string()
}).strict()))

export const Schema_CreateRenditionJobApiResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "status": z.enum(["succeeded"]),
  "jobId": z.string(),
  "outputs": z.array(Schema_CreateRenditionOutput)
}).strict()))

export const Schema_VectorizeRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "input": Schema_VectorizeInput,
  "settings": Schema_VectorizeSettings.optional()
}).strict()))

export const Schema_VectorizeInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_VectorizeSourceUrl,
  "mediaType": Schema_VectorizeInputMediaType
}).strict()))

export const Schema_VectorizeSourceUrl: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string()
}).strict()))

export const Schema_VectorizeInputMediaType: z.ZodTypeAny = z.lazy(() => (z.enum(["image/png", "image/jpeg"])))

export const Schema_VectorizeSettings: z.ZodTypeAny = z.lazy(() => (z.object({
  "preset": z.enum(["enhanced_general", "high_fidelity_photo"]).optional()
}).strict()))

export const Schema_ImageTraceOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "destination": Schema_CreateRenditionOutputDestination,
  "mediaType": z.enum(["image/svg+xml"])
}).strict()))

export const Schema_ImageTraceJobApiResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "status": z.enum(["succeeded"]),
  "jobId": z.string(),
  "outputs": z.array(Schema_ImageTraceOutput)
}).strict()))

export const Schema_ImageTraceJobFailedResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "status": z.enum(["failed"]),
  "error_code": z.string(),
  "message": z.string()
}).strict()))
