/* eslint-disable */
/** Generated from firefly/firefly-api.json — do not edit. */
import { z } from "zod"

export const Schema_AlignmentHorizontal: z.ZodTypeAny = z.lazy(() => (z.enum(["center", "left", "right"])))

export const Schema_AlignmentVertical: z.ZodTypeAny = z.lazy(() => (z.enum(["center", "top", "bottom"])))

export const Schema_ApiError: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": Schema_ColligoErrorCodeAsyncV3,
  "message": z.string().optional(),
  "stack_trace": z.array(z.string()).optional(),
  "validation_errors": z.array(Schema_ValidationErrorMessage).optional()
})))

export const Schema_ColligoErrorCodeAsyncV3: z.ZodTypeAny = z.lazy(() => (z.enum(["validation_error", "runtime_error", "timeout_error", "rate_limited", "access_error", "invalid_content_type", "empty_input_body", "bad_request"])))

export const Schema_ValidationErrorMessage: z.ZodTypeAny = z.lazy(() => (z.object({
  "ctx": z.object({}).optional(),
  "loc": z.array(z.union([z.number().int(), z.string()])),
  "msg": z.string(),
  "type": z.string()
})))

export const Schema_AspectRatio: z.ZodTypeAny = z.lazy(() => (z.enum(["1:1", "4:3", "3:4", "16:9", "9:16", "auto"])))

export const Schema_ApiErrorGeneric: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": z.string().optional(),
  "message": z.string().optional()
})))

export const Schema_AdaptiveCompositeRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "background": Schema_BackgroundInput,
  "object": Schema_AdaptiveObjectInput,
  "numVariations": z.number().int().min(1).max(3).optional(),
  "seeds": z.array(z.number().int()).optional(),
  "harmonization": z.number().min(0).max(1).optional(),
  "shadowIntensity": z.number().min(0).max(1).optional(),
  "preserveBackground": z.boolean().optional(),
  "output": Schema_OutputSpec.optional()
})))

export const Schema_BackgroundInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "image": Schema_ImageRef,
  "fillAreaMask": Schema_ImageRef
})))

export const Schema_ImageRef: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_ImageSource
})))

export const Schema_ImageSource: z.ZodTypeAny = z.lazy(() => (z.object({
  "uploadId": z.string().optional(),
  "url": z.string().optional()
})))

export const Schema_AdaptiveObjectInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "image": Schema_ImageRef,
  "mask": Schema_ImageRef.optional()
})))

export const Schema_OutputSpec: z.ZodTypeAny = z.lazy(() => (z.object({
  "mediaType": z.enum(["image/png", "image/jpeg", "image/webp", "image/jxl"]).optional()
})))

export const Schema_AsyncJobResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "status": z.string().optional(),
  "jobId": z.string().optional(),
  "statusUrl": z.string().optional(),
  "cancelUrl": z.string().optional()
})))

export const Schema_ObjectInput: z.ZodTypeAny = z.lazy(() => (z.object({
  "image": Schema_ImageRef
})))

export const Schema_PreciseCompositeRequest: z.ZodTypeAny = z.lazy(() => (z.object({
  "background": Schema_BackgroundInput,
  "object": Schema_ObjectInput,
  "numVariations": z.number().int().min(1).max(3).optional(),
  "seeds": z.array(z.number().int()).optional(),
  "blend": z.number().min(0).max(1).optional(),
  "output": Schema_OutputSpec.optional()
})))

export const Schema_ValidationErrorDetail: z.ZodTypeAny = z.lazy(() => (z.object({
  "loc": z.array(z.union([z.string(), z.number().int()])).optional(),
  "msg": z.string().optional(),
  "type": z.string().optional(),
  "ctx": z.record(z.string(), z.string()).optional()
})))

export const Schema_ValidationErrorCode422: z.ZodTypeAny = z.lazy(() => (z.enum(["validation_error", "cai_assertion_violation_error"])))

export const Schema_ValidationErrorResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": Schema_ValidationErrorCode422,
  "message": z.string().optional(),
  "validation_errors": z.array(Schema_ValidationErrorDetail).optional()
})))

export const Schema_ContentPolicyErrorCode451: z.ZodTypeAny = z.lazy(() => (z.enum(["legal_error", "prompt_unsafe", "prompt_entity_denied", "image_unsafe", "video_unsafe", "reference_image_unsafe_error", "input_media_unsafe"])))

export const Schema_ContentPolicyErrorResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": Schema_ContentPolicyErrorCode451,
  "message": z.string().optional()
})))

export const Schema_JobOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "seed": z.number().int(),
  "image": Schema_PublicBinary_Output
})))

export const Schema_PublicBinary_Output: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string()
})))

export const Schema_JobPollPayload: z.ZodTypeAny = z.lazy(() => (z.object({
  "status": z.enum(["pending", "running", "failed", "cancelled", "cancel_pending", "timeout"]),
  "jobId": z.string(),
  "error_code": z.string().optional(),
  "message": z.string().optional()
})))

export const Schema_JobResult: z.ZodTypeAny = z.lazy(() => (z.object({
  "outputs": z.array(Schema_JobOutput)
})))

export const Schema_JobResponse: z.ZodTypeAny = z.lazy(() => (z.union([Schema_JobSucceededPayload, Schema_JobPollPayload])))

export const Schema_JobSucceededPayload: z.ZodTypeAny = z.lazy(() => (z.object({
  "status": z.enum(["succeeded"]),
  "jobId": z.string(),
  "result": z.union([Schema_JobResult, Schema_PreciseUpsamplerResponse])
})))

export const Schema_PreciseUpsamplerResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "outputs": z.array(Schema_UpscaleBinaryOutput),
  "version": z.string()
})))

export const Schema_UpscaleBinaryOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "id": z.string().optional(),
  "presignedUrl": z.string().min(1).max(4096).optional(),
  "creativeCloudFileId": z.string().optional(),
  "creativeCloudComponentId": z.string().optional(),
  "name": z.string().optional()
})))

export const Schema_AsyncAcceptResponseV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "cancelUrl": z.string(),
  "jobId": z.string(),
  "statusUrl": z.string()
})))

export const Schema_AsyncApiErrorV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "error_code": z.union([z.string(), Schema_ColligoErrorCodeAsyncV3, Schema_ColliogAsyncStatusErrorCodeV3, Schema_ColligoAsyncCancelErrorCodeV3]).optional(),
  "jobId": z.string().optional(),
  "message": z.string().optional(),
  "status": z.string().optional(),
  "validation_errors": z.array(Schema_ValidationErrorMessage).optional()
})))

export const Schema_ColliogAsyncStatusErrorCodeV3: z.ZodTypeAny = z.lazy(() => (z.enum(["unknown_job_id"])))

export const Schema_ColligoAsyncCancelErrorCodeV3: z.ZodTypeAny = z.lazy(() => (z.enum(["job_timeout", "job_completed", "unknown_job_id", "job_already_canceled", "job_cancel_failed"])))

export const Schema_AsyncTaskLink: z.ZodTypeAny = z.lazy(() => (z.object({
  "href": z.string()
})))

export const Schema_AsyncTaskLinkType: z.ZodTypeAny = z.lazy(() => (z.enum(["cancel", "result"])))

export const Schema_AsyncTaskResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "links": z.record(z.string(), Schema_AsyncTaskLink),
  "progress": z.number().optional()
})))

export const Schema_AsyncTaskResponseV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "jobId": z.string(),
  "progress": z.number().optional(),
  "result": z.union([Schema_GenerateImagesResponseV3, Schema_GenerateSimilarImagesResponseV3, Schema_ExpandImageResponseV3, Schema_FillImageResponseV3, Schema_GenerateObjectCompositeResponseV3]).optional(),
  "status": z.enum(["pending", "running", "succeeded", "failed", "canceled"])
})))

export const Schema_GenerateImagesResponseV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "altText": z.string().optional(),
  "contentClass": Schema_ContentClassV3.optional(),
  "outputs": z.array(Schema_OutputImageV3),
  "promptHasBlockedArtists": z.boolean().optional(),
  "promptHasDeniedWords": z.boolean().optional(),
  "size": Schema_Size
})))

export const Schema_ContentClassV3: z.ZodTypeAny = z.lazy(() => (z.enum(["photo", "art"])))

export const Schema_OutputImageV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "image": Schema_PublicBinaryOutputV3,
  "seed": z.number().int()
})))

export const Schema_PublicBinaryOutputV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string().min(1).max(2083).optional()
})))

export const Schema_Size: z.ZodTypeAny = z.lazy(() => (z.object({
  "height": z.number().int().min(1).max(4096),
  "width": z.number().int().min(1).max(4096)
})))

export const Schema_GenerateSimilarImagesResponseV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "outputs": z.array(Schema_OutputImageV3),
  "size": Schema_Size
})))

export const Schema_ExpandImageResponseV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "outputs": z.array(Schema_OutputImageV3),
  "size": Schema_Size
})))

export const Schema_FillImageResponseV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "outputs": z.array(Schema_OutputImageV3),
  "size": Schema_Size
})))

export const Schema_GenerateObjectCompositeResponseV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "contentClass": Schema_ContentClassV3.optional(),
  "outputs": z.array(Schema_OutputImageV3),
  "size": Schema_Size
})))

export const Schema_BaseInputImageV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_PublicBinaryInputV3
})))

export const Schema_PublicBinaryInputV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "uploadId": z.string().optional(),
  "url": z.string().min(1).max(2083).optional()
})))

export const Schema_PreciseUpscaleAcceptResponseV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "links": z.record(z.string(), Schema_PreciseUpscaleTaskLink),
  "progress": z.number().optional()
})))

export const Schema_PreciseUpscaleTaskLink: z.ZodTypeAny = z.lazy(() => (z.object({
  "href": z.string()
})))

export const Schema_PreciseUpsamplerRequestV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "image": Schema_BaseInputImageV3,
  "seeds": z.array(z.number().int()),
  "upscaleFactor": Schema_UpsampleFactor.optional()
})))

export const Schema_UpsampleFactor: z.ZodTypeAny = z.lazy(() => (z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)])))

export const Schema_BaseInputMaskV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_PublicBinaryInputV3.optional()
})))

export const Schema_Body_expandImagesV3Async: z.ZodTypeAny = z.lazy(() => (z.object({
  "files": z.array(z.string()),
  "request": Schema_ExpandImageRequestV3
})))

export const Schema_ExpandImageRequestV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "image": Schema_InputImageV3,
  "mask": Schema_InputMaskV3.optional(),
  "numVariations": z.number().int().min(1).max(4).optional(),
  "placement": Schema_Placement.optional(),
  "prompt": z.string().min(1).max(1024).optional(),
  "seeds": z.array(z.number().int()).optional(),
  "size": Schema_Size.optional()
})))

export const Schema_InputImageV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "mask": Schema_PublicBinaryInputV3.optional(),
  "source": Schema_PublicBinaryInputV3
})))

export const Schema_InputMaskV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "invert": z.boolean().optional(),
  "source": Schema_PublicBinaryInputV3
})))

export const Schema_Placement: z.ZodTypeAny = z.lazy(() => (z.object({
  "alignment": Schema_PlacementAlignment.optional(),
  "inset": Schema_PlacementInset.optional()
})))

export const Schema_PlacementAlignment: z.ZodTypeAny = z.lazy(() => (z.object({
  "horizontal": Schema_AlignmentHorizontal.optional(),
  "vertical": Schema_AlignmentVertical.optional()
})))

export const Schema_PlacementInset: z.ZodTypeAny = z.lazy(() => (z.object({
  "bottom": z.number().int().optional(),
  "left": z.number().int().optional(),
  "right": z.number().int().optional(),
  "top": z.number().int().optional()
})))

export const Schema_Body_fillImagesV3Async: z.ZodTypeAny = z.lazy(() => (z.object({
  "files": z.array(z.string()),
  "request": Schema_FillImageRequestV3
})))

export const Schema_FillImageRequestV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "image": Schema_InputImageV3,
  "mask": Schema_InputMaskV3,
  "negativePrompt": z.string().max(1024).optional(),
  "numVariations": z.number().int().min(1).max(4).optional(),
  "prompt": z.string().min(1).max(1024).optional(),
  "promptBiasingLocaleCode": z.string().optional(),
  "seeds": z.array(z.number().int()).optional(),
  "size": Schema_Size.optional()
})))

export const Schema_Body_generateImagesV3Async: z.ZodTypeAny = z.lazy(() => (z.object({
  "files": z.array(z.string()),
  "request": Schema_GenerateImagesRequestV3
})))

export const Schema_GenerateImagesRequestV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "contentClass": Schema_ContentClassV3.optional(),
  "customModelId": z.string().optional(),
  "negativePrompt": z.string().max(1024).optional(),
  "numVariations": z.number().int().min(1).max(4).optional(),
  "prompt": z.string().min(1).max(1024),
  "promptBiasingLocaleCode": z.string().optional(),
  "seeds": z.array(z.number().int()).optional(),
  "size": Schema_Size.optional(),
  "structure": Schema_StructureReferenceV3.optional(),
  "style": Schema_StylesV3.optional(),
  "upsamplerType": z.enum(["default", "low_creativity"]).optional(),
  "visualIntensity": z.number().int().min(2).max(10).optional()
})))

export const Schema_StructureReferenceV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "imageReference": Schema_StructureImageReferenceV3.optional(),
  "strength": z.number().int().min(0).max(100).optional()
})))

export const Schema_StructureImageReferenceV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_PublicBinaryInputV3.optional()
})))

export const Schema_StylesV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "imageReference": Schema_StylesImageReferenceV3.optional(),
  "presets": z.array(z.string()).optional(),
  "strength": z.number().int().max(100).optional()
})))

export const Schema_StylesImageReferenceV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_PublicBinaryInputV3.optional()
})))

export const Schema_Body_generateObjectCompositeV3Async: z.ZodTypeAny = z.lazy(() => (z.object({
  "files": z.array(z.string()),
  "request": Schema_GenerateObjectCompositeRequestV3
})))

export const Schema_GenerateObjectCompositeRequestV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "contentClass": Schema_ContentClassV3.optional(),
  "image": Schema_InputImageV3,
  "mask": Schema_BaseInputMaskV3.optional(),
  "numVariations": z.number().int().min(1).max(4).optional(),
  "placement": Schema_Placement.optional(),
  "prompt": z.string().min(1).max(1024),
  "seeds": z.array(z.number().int()).optional(),
  "size": Schema_Size.optional(),
  "style": Schema_StylesV3.optional()
})))

export const Schema_Body_generateSimilarImagesV3Async: z.ZodTypeAny = z.lazy(() => (z.object({
  "files": z.array(z.string()),
  "request": Schema_GenerateSimilarImagesRequestV3
})))

export const Schema_GenerateSimilarImagesRequestV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "image": Schema_BaseInputImageV3,
  "numVariations": z.number().int().min(1).max(4).optional(),
  "seeds": z.array(z.number().int()).optional(),
  "size": Schema_Size.optional()
})))

export const Schema_FireflyModelId: z.ZodTypeAny = z.lazy(() => (z.enum(["firefly_image"])))

export const Schema_ImageGenerateRequestV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "prompt": z.string().min(1).max(1500),
  "aspectRatio": Schema_AspectRatio.optional(),
  "resolutionLevel": z.enum(["1MP", "2.4MP", "4MP"]).optional(),
  "modelId": Schema_FireflyModelId.optional(),
  "modelSpecificPayload": Schema_ModelSpecificPayloadV3.optional(),
  "numVariations": z.number().int().max(1).optional(),
  "referenceBlobs": z.array(Schema_ReferenceBlobV3).optional(),
  "seeds": z.array(z.number().int()).optional()
})))

export const Schema_ModelSpecificPayloadV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "localeCode": z.string().optional(),
  "prompt_reasoner": z.enum(["quality", "speed"]).optional()
})))

export const Schema_ReferenceBlobV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "source": Schema_ReferenceBlobSourceV3,
  "usage": Schema_ReferenceBlobUsageV3.optional()
})))

export const Schema_ReferenceBlobSourceV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "uploadId": z.string().optional(),
  "url": z.string().optional()
})))

export const Schema_ReferenceBlobUsageV3: z.ZodTypeAny = z.lazy(() => (z.enum(["general"])))

export const Schema_HTTPValidationError: z.ZodTypeAny = z.lazy(() => (z.object({
  "detail": z.array(Schema_ValidationError).optional()
})))

export const Schema_ValidationError: z.ZodTypeAny = z.lazy(() => (z.object({
  "loc": z.array(z.union([z.string(), z.number().int()])),
  "msg": z.string(),
  "type": z.string()
})))

export const Schema_GenerateVideoRequestV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "bitRateFactor": z.number().int().min(0).max(63).optional(),
  "image": Schema_InputImageVideoV3.optional(),
  "prompt": z.string().optional(),
  "seeds": z.array(z.number().int()).optional(),
  "sizes": z.array(Schema_ClinetoSize).optional(),
  "videoSettings": Schema_VideoSettingsV3.optional()
})))

export const Schema_InputImageVideoV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "conditions": z.array(Schema_ImageConditionV3).optional()
})))

export const Schema_ImageConditionV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "placement": Schema_PlacementStart,
  "source": Schema_PublicBinaryInputV3
})))

export const Schema_PlacementStart: z.ZodTypeAny = z.lazy(() => (z.object({
  "position": z.number().min(0).max(1)
})))

export const Schema_ClinetoSize: z.ZodTypeAny = z.lazy(() => (z.object({
  "height": z.number().int().min(1).max(8192),
  "width": z.number().int().min(1).max(8192)
})))

export const Schema_VideoSettingsV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "cameraMotion": Schema_CameraMotion.optional(),
  "promptStyle": Schema_VideoPromptStyle.optional(),
  "shotAngle": Schema_ShotAngle.optional(),
  "shotSize": Schema_ShotSize.optional()
})))

export const Schema_CameraMotion: z.ZodTypeAny = z.lazy(() => (z.enum(["camera pan left", "camera pan right", "camera zoom in", "camera zoom out", "camera tilt up", "camera tilt down", "camera locked down", "camera handheld"])))

export const Schema_VideoPromptStyle: z.ZodTypeAny = z.lazy(() => (z.enum(["anime", "3d", "fantasy", "cinematic", "claymation", "line art", "stop motion", "2d", "vector art", "black and white"])))

export const Schema_ShotAngle: z.ZodTypeAny = z.lazy(() => (z.enum(["aerial shot", "eye_level shot", "high angle shot", "low angle shot", "top-down shot"])))

export const Schema_ShotSize: z.ZodTypeAny = z.lazy(() => (z.enum(["close-up shot", "extreme close-up", "medium shot", "long shot", "extreme long shot"])))

export const Schema_VideoResult: z.ZodTypeAny = z.lazy(() => (z.object({
  "url": z.string()
})))

export const Schema_VideoOutput: z.ZodTypeAny = z.lazy(() => (z.object({
  "seed": z.number().int(),
  "video": Schema_VideoResult
})))

export const Schema_AsyncResult: z.ZodTypeAny = z.lazy(() => (z.object({
  "size": Schema_ClinetoSize,
  "outputs": z.array(Schema_VideoOutput)
})))

export const Schema_AsyncResponseV3: z.ZodTypeAny = z.lazy(() => (z.object({
  "cancelUrl": z.string().optional(),
  "jobId": z.string(),
  "progress": z.number().int().optional(),
  "result": Schema_AsyncResult.optional(),
  "status": z.string().optional(),
  "statusUrl": z.string().optional()
})))

export const Schema_ErrorResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "reason": z.string().optional(),
  "message": z.string().optional()
})))

export const Schema_CustomModelsFF3pInfo: z.ZodTypeAny = z.lazy(() => (z.object({
  "custom_models": z.array(Schema_CustomModelFF3pInfo).optional(),
  "_links": Schema_Links.optional(),
  "total_count": z.number().int().optional()
})))

export const Schema_CustomModelFF3pInfo: z.ZodTypeAny = z.lazy(() => (z.object({
  "version": z.string().optional(),
  "assetName": z.string().optional(),
  "size": z.number().int().optional(),
  "etag": z.string().optional(),
  "trainingMode": z.enum(["subject", "style"]).optional(),
  "assetId": z.string().optional(),
  "mediaType": z.string().optional(),
  "createdDate": z.string().optional(),
  "modifiedDate": z.string().optional(),
  "publishedState": z.enum(["never", "published", "unpublished"]).optional(),
  "baseModel": Schema_BaseModel.optional(),
  "samplePrompt": z.string().optional(),
  "displayName": z.string().optional(),
  "conceptId": z.string().optional()
})))

export const Schema_BaseModel: z.ZodTypeAny = z.lazy(() => (z.object({
  "name": z.string().optional(),
  "version": z.string().optional()
})))

export const Schema_Links: z.ZodTypeAny = z.lazy(() => (z.object({
  "page": Schema_Link.optional(),
  "next": Schema_Link.optional()
})))

export const Schema_Link: z.ZodTypeAny = z.lazy(() => (z.object({
  "href": z.string().optional(),
  "rel": z.string().optional(),
  "templated": z.boolean().optional()
})))

export const Schema_PageSpec: z.ZodTypeAny = z.lazy(() => (z.object({
  "orderBy": z.string().optional(),
  "start": z.string().optional(),
  "next": z.string().optional(),
  "count": z.number().int().optional(),
  "type": z.string().optional(),
  "property": z.string().optional()
})))

export const Schema_StorageImageResponse: z.ZodTypeAny = z.lazy(() => (z.object({
  "images": z.array(Schema_StorageImage).optional()
})))

export const Schema_StorageImage: z.ZodTypeAny = z.lazy(() => (z.object({
  "id": z.string()
})))

export const Schema_ErrorBody: z.ZodTypeAny = z.lazy(() => (z.object({
  "message": z.string().optional(),
  "error_code": z.string().optional()
})))
