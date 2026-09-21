/* eslint-disable */
/** Generated Adobe audio-video capability shells — do not edit. */
import { capabilityFor, type CapabilityHandler } from "@executioncontrolprotocol/core"
import { z } from "zod"
import * as schemas from "./schemas.js"

const EXT_ID = "@executioncontrolprotocol/adobe-firefly-services"

/** Get available voices */
export function audio_video_voices(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-voices")
    .withInput(z.object({}))
    .withOutput(schemas.Schema_SuccessfulVoicesResponse)
    .withMetadata({"summary":"Get available voices","description":"This endpoint provides the list of all available voices for the user's enterprise.","useCases":["Audio Video Text-to-speech tasks that need this operation","Audio Video Text-to-Avatar tasks that need this operation","When the workflow goal is to get available voices"],"samplePrompts":["Get available voices","Get available voices with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Generate speech from text */
export function audio_video_generate_speech(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-generate-speech")
    .withInput(z.object({
  body: schemas.Schema_TTSRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Generate speech from text","description":"This endpoint generates speech from a transcript. You can provide the transcript either as plain text or a pre-signed URL. The response will include a job ID and a status URL for tracking the job.","useCases":["Audio Video Text-to-speech tasks that need this operation","When the workflow goal is to generate speech from text"],"samplePrompts":["Generate speech from text","Generate speech from text with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Get job status */
export function audio_video_status(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-status")
    .withInput(z.object({
  path: z.object({
  "jobId": z.string()
})
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Get job status","description":"Provides the status and result of an asynchronous job. For Dynamic Graphics Render (DGR), returns the status of a Describe template or Render job.","useCases":["Audio Video Manage jobs tasks that need this operation","When the workflow goal is to get job status"],"samplePrompts":["Get job status","Get job status with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Describe template */
export function audio_video_template_describe(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-template-describe")
    .withInput(z.object({
  body: schemas.Schema_TemplateDescribeRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Describe template","description":"Analyzes a MOGRT (video template) file and returns a manifest of editable controls; fonts, images, audio, video and other supported values.","useCases":["Audio Video Dynamic Graphics Render tasks that need this operation","When the workflow goal is to describe template"],"samplePrompts":["Describe template","Describe template with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Fetch video rendering presets */
export function audio_video_get_presets(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-get-presets")
    .withInput(z.object({}))
    .withOutput(schemas.Schema_PresetsResponse)
    .withMetadata({"summary":"Fetch video rendering presets","description":"Returns a list of predefined social-first encoding presets for rendering outputs.","useCases":["Audio Video Dynamic Graphics Render tasks that need this operation","When the workflow goal is to fetch video rendering presets"],"samplePrompts":["Fetch video rendering presets","Fetch video rendering presets with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Render template */
export function audio_video_template_render(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-template-render")
    .withInput(z.object({
  body: schemas.Schema_TemplateRenderRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_JobStatus)
    .withMetadata({"summary":"Render template","description":"Renders one or more video variations by applying overrides and export presets. Submit up to 10 overrides per call for a subset of editable layers and get a pre-signed URL link to download the video file. For layers that are not editable, the system defaults are automatically applied at export.","useCases":["Audio Video Dynamic Graphics Render tasks that need this operation","When the workflow goal is to render template"],"samplePrompts":["Render template","Render template with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Cancel a render job */
export function audio_video_cancel_render_job(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-cancel-render-job")
    .withInput(z.object({
  path: z.object({
  "jobId": z.string()
}),
  headers: z.object({
  "x-request-id": z.string().optional()
}).optional()
}))
    .withOutput(schemas.Schema_CancelAcceptedResponse)
    .withMetadata({"summary":"Cancel a render job","description":"Aborts an in-flight render job. Returns `202 Accepted` as soon as the cancellation has been accepted; subsequent calls to `GET /v1/status/{jobId}` will report `\"status\": \"canceled\"` once the worker has fully stopped the underlying render. **Applicable only to render jobs submitted via `POST /v1/templates/render`.** This endpoint does not apply to Describe, Reframe, TLS, TTS, or Avatar jobs. **Notes:** - Cancellation is idempotent. - Once propagated to the worker, in-progress outputs are not uploaded to the destinations specified in the original render request. - For a short window after the PUT, the status endpoint may still report `running`; poll until it transitions to `canceled`.","useCases":["Audio Video Dynamic Graphics Render tasks that need this operation","Audio Video Manage jobs tasks that need this operation","When the workflow goal is to cancel a render job"],"samplePrompts":["Cancel a render job","Cancel a render job with Adobe Audio Video"]})
    .withHandler(handler)
}

/** List render jobs */
export function audio_video_list_render_jobs(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-list-render-jobs")
    .withInput(z.object({
  query: z.object({
  "filter": z.string().optional(),
  "limit": z.number().int().min(1).max(100).optional(),
  "cursor": z.string().optional()
}).optional(),
  headers: z.object({
  "x-request-id": z.string().optional()
}).optional()
}))
    .withOutput(schemas.Schema_RenderJobListResponse)
    .withMetadata({"summary":"List render jobs","description":"Returns a paginated list of template render jobs owned by the authenticated caller, optionally filtered by status and creation date. **Applicable only to render jobs submitted via `POST /v1/templates/render`.** Jobs from other API types (Describe, Reframe, TLS, TTS, Avatar) are not returned. **Filter syntax (FIQL):** - `status==running` — single status equality - `status=in=(running,not_started)` — status set membership - `createdDate=ge=2026-05-01T00:00:00Z` — absolute ISO 8601 lower bound - `createdDate=ge=-P7D` — relative ISO 8601 duration (last 7 days) - Combine with `;` (AND): `status==running;createdDate=ge=-P7D` **Default filter:** all statuses, `createdDate` within the last 30 days. **Retention:** `createdDate` filter values must fall within the 30-day retention window. **Pagination:** follow `paging.nextUrl` until it is absent (last page).","useCases":["Audio Video Dynamic Graphics Render tasks that need this operation","Audio Video Manage jobs tasks that need this operation","When the workflow goal is to list render jobs"],"samplePrompts":["List render jobs","List render jobs with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Reframe video */
export function audio_video_generate_reframed_video(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-generate-reframed-video")
    .withInput(z.object({
  body: z.object({
  "video": z.object({
  "source": z.object({
  "url": z.string()
}),
  "mediaType": z.enum(["video/mp4", "video/quicktime"])
}),
  "sceneEditDetection": z.boolean().optional(),
  "overlays": z.array(schemas.Schema_Overlay).optional(),
  "outputConfig": z.object({
  "aspectRatios": z.array(z.string())
})
}),
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Reframe video","description":"This endpoint enables you to reframe video using AI. Provide video input with a pre-signed URL to generate reframed video output. This API has more limited capabilities than the v2 endpoint, and may be deprecated soon. **It's recommended to use the v2 endpoint instead.**","useCases":["Audio Video Reframe tasks that need this operation","When the workflow goal is to reframe video"],"samplePrompts":["Reframe video","Reframe video with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Transcribe media */
export function audio_video_transcribe(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-transcribe")
    .withInput(z.object({
  body: schemas.Schema_TranscribeRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_FireflyJobResponse)
    .withMetadata({"summary":"Transcribe media","description":"Generates transcripts and captions for the input audio or video in the source language or in a target language.","useCases":["Audio Video Translate and lip sync tasks that need this operation","When the workflow goal is to transcribe media"],"samplePrompts":["Transcribe media","Transcribe media with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Dub audio or video */
export function audio_video_dub(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-dub")
    .withInput(z.object({
  body: schemas.Schema_DubRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_FireflyJobResponse)
    .withMetadata({"summary":"Dub audio or video","description":"Generate dubbed video or audio. A composited lip sync can also be added for video dubbing.","useCases":["Audio Video Translate and lip sync tasks that need this operation","When the workflow goal is to dub audio or video"],"samplePrompts":["Dub audio or video","Dub audio or video with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Get available avatars */
export function audio_video_avatars(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-avatars")
    .withInput(z.object({}))
    .withOutput(schemas.Schema_SuccessfulAvatarsResponse)
    .withMetadata({"summary":"Get available avatars","description":"Retrieves the list of all available avatars for the user's enterprise.","useCases":["Audio Video Text-to-Avatar tasks that need this operation","When the workflow goal is to get available avatars"],"samplePrompts":["Get available avatars","Get available avatars with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Reframe video v2 */
export function audio_video_generate_reframed_video_v2(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-generate-reframed-video-v2")
    .withInput(z.object({
  body: z.object({
  "video": schemas.Schema_VideoInputV2,
  "analysis": schemas.Schema_AnalysisV2.optional(),
  "composition": schemas.Schema_CompositionV2.optional(),
  "output": z.object({
  "format": schemas.Schema_OutputFormatV2.optional(),
  "renditions": z.array(z.union([z.object({
  "aspectRatio": schemas.Schema_AspectRatioV2,
  "mediaDestination": schemas.Schema_Destination.optional(),
  "sidecarDestination": schemas.Schema_Destination.optional()
}), z.object({
  "resolution": z.object({
  "width": z.number().int(),
  "height": z.number().int()
}),
  "mediaDestination": schemas.Schema_Destination.optional(),
  "sidecarDestination": schemas.Schema_Destination.optional()
})]))
})
}),
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Reframe video v2","description":"This endpoint enables you to reframe the input media. You can provide a video input via a pre-signed URL to generate reframed output video.","useCases":["Audio Video Reframe tasks that need this operation","When the workflow goal is to reframe video v2"],"samplePrompts":["Reframe video v2","Reframe video v2 with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Get job result */
export function audio_video_job_result_v2(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-job-result-v2")
    .withInput(z.object({
  path: z.object({
  "jobId": z.string()
})
}))
    .withOutput(z.union([z.object({
  "status": z.enum(["not_started", "running", "failed", "succeeded", "partially_succeeded"]),
  "jobId": z.string()
}), z.object({
  "status": z.enum(["not_started", "running", "failed", "succeeded", "partially_succeeded"]),
  "jobId": z.string(),
  "outputs": z.array(z.union([z.object({
  "destination": z.object({
  "url": z.string()
})
}), z.object({
  "error": z.object({
  "error_code": z.string(),
  "message": z.string()
})
})]))
}), z.object({
  "status": z.enum(["not_started", "running", "failed", "succeeded", "partially_succeeded"]),
  "jobId": z.string(),
  "outputs": z.array(z.union([z.object({
  "destination": z.object({
  "url": z.string()
})
}), z.object({
  "error": z.object({
  "error_code": z.string(),
  "message": z.string()
})
})]))
}), z.object({
  "status": z.enum(["not_started", "running", "failed", "succeeded", "partially_succeeded"]),
  "jobId": z.string(),
  "outputs": z.object({
  "renditions": z.array(z.object({
  "error": z.object({
  "error_code": z.string(),
  "message": z.string()
})
}))
})
})]))
    .withMetadata({"summary":"Get job result","description":"This endpoint retrieves the result of an asynchronous reframed job initiated using the job ID.","useCases":["Audio Video Reframe tasks that need this operation","Audio Video Manage jobs tasks that need this operation","When the workflow goal is to get job result"],"samplePrompts":["Get job result","Get job result with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Generate avatar video from text */
export function audio_video_generate_avatar(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-generate-avatar")
    .withInput(z.object({
  body: schemas.Schema_AvatarRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Generate avatar video from text","description":"Generates an avatar video from a provided transcript or audio file. You can provide the transcript either as plain text or a pre-signed URL. The API is asynchronous, so the response will include a job ID and a status URL for tracking the running job.","useCases":["Audio Video Text-to-Avatar tasks that need this operation","When the workflow goal is to generate avatar video from text"],"samplePrompts":["Generate avatar video from text","Generate avatar video from text with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Transcribe media */
export function audio_video_transcribe__v1_transcribe(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-transcribe-transcribe")
    .withInput(z.object({
  body: schemas.Schema_TranscribeRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_FireflyJobResponse)
    .withMetadata({"summary":"Transcribe media","description":"Generates transcripts for the input audio or video.","useCases":["When the workflow goal is to transcribe media"],"samplePrompts":["Transcribe media","Transcribe media with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Dub audio or video */
export function audio_video_dub__v1_dub(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-dub-dub")
    .withInput(z.object({
  body: schemas.Schema_DubRequest,
  pollIntervalMs: z.number().int().positive().optional(),
  pollTimeoutMs: z.number().int().positive().optional()
}))
    .withOutput(schemas.Schema_FireflyJobResponse)
    .withMetadata({"summary":"Dub audio or video","description":"Generate dubbed video or audio. A composited lip sync can be added for video dubbing.","useCases":["When the workflow goal is to dub audio or video"],"samplePrompts":["Dub audio or video","Dub audio or video with Adobe Audio Video"]})
    .withHandler(handler)
}

/** Get the result for a job */
export function audio_video_job_result(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-job-result")
    .withInput(z.object({
  path: z.object({
  "jobId": z.string()
})
}))
    .withOutput(schemas.Schema_FireflyJobResponse)
    .withMetadata({"summary":"Get the result for a job","description":"Provides the result for an async dub job.","useCases":["When the workflow goal is to get the result for a job"],"samplePrompts":["Get the result for a job","Get the result for a job with Adobe Audio Video"]})
    .withHandler(handler)
}
