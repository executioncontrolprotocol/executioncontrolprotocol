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
    .withMetadata({"summary":"Get available voices","description":"This endpoint provides the list of all available voices for the user's enterprise.","useCases":["Audio Video Text-to-speech tasks that need this operation","Audio Video Text-to-Avatar tasks that need this operation","When the workflow goal is to get available voices"],"projections":[{"summary":"Take listed items","description":"Keep each item id and display name from the list so later steps can select one."}]})
    .withHandler(handler)
}

/** Generate speech from text */
export function audio_video_generate_speech(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-generate-speech")
    .withInput(z.object({
  script: z.union([schemas.Schema_TextSource, schemas.Schema_URLSource]).optional(),
  voiceId: z.string().optional(),
  output: z.object({
  "mediaType": schemas.Schema_SupportedAudioOutputAudioFormat
}).optional(),
  body: schemas.Schema_TTSRequest.optional()
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Generate speech from text","description":"This endpoint generates speech from a transcript. You can provide the transcript either as plain text or a pre-signed URL. The response will include a job ID and a status URL for tracking the job.","useCases":["Audio Video Text-to-speech tasks that need this operation","When the workflow goal is to generate speech from text"],"projections":[{"summary":"Take returned assets","description":"Keep asset URLs or output references from the result for download or the next edit step."}]})
    .withHandler(handler)
}

/** Describe template */
export function audio_video_template_describe(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-template-describe")
    .withInput(z.object({
  type: z.enum(["mogrt", "aep"]).optional(),
  source: z.object({
  "url": z.string()
}).optional(),
  compName: z.string().optional(),
  body: schemas.Schema_TemplateDescribeRequest.optional()
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Describe template","description":"Analyzes a MOGRT (video template) file and returns a manifest of editable controls; fonts, images, audio, video and other supported values.","useCases":["Audio Video Dynamic Graphics Render tasks that need this operation","When the workflow goal is to describe template"],"projections":[{"summary":"Inspect the structured result","description":"Read the returned document or asset facts you need for authoring, such as names, sizes, and ids."}]})
    .withHandler(handler)
}

/** Fetch video rendering presets */
export function audio_video_get_presets(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-get-presets")
    .withInput(z.object({}))
    .withOutput(schemas.Schema_PresetsResponse)
    .withMetadata({"summary":"Fetch video rendering presets","description":"Returns a list of predefined social-first encoding presets for rendering outputs.","useCases":["Audio Video Dynamic Graphics Render tasks that need this operation","When the workflow goal is to fetch video rendering presets"],"projections":[{"summary":"Take listed items","description":"Keep each item id and display name from the list so later steps can select one."}]})
    .withHandler(handler)
}

/** Render template */
export function audio_video_template_render(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-template-render")
    .withInput(z.object({
  type: z.enum(["mogrt", "aep"]).optional(),
  source: z.object({
  "url": z.string()
}).optional(),
  compName: z.string().optional(),
  fonts: z.array(z.object({
  "name": z.string(),
  "source": z.object({
  "url": z.string()
})
})).optional(),
  config: z.object({
  "handleMissingFonts": z.enum(["fail", "use_default"]).optional(),
  "sidecar": z.enum(["aep"]).optional()
}).optional(),
  assets: z.array(z.object({
  "source": z.object({
  "url": z.string()
})
})).optional(),
  presets: z.array(z.object({
  "source": z.object({
  "presetId": z.string().optional(),
  "url": z.string().optional()
})
})).optional(),
  variations: z.array(z.object({
  "variables": z.array(z.object({
  "variableId": z.string(),
  "selectedCheckboxValue": z.boolean().optional(),
  "selectedDropdownValue": z.string().optional(),
  "selectedSliderValue": z.number().optional(),
  "text": z.string().optional(),
  "fontName": z.string().optional(),
  "assetIndex": z.number().int().optional(),
  "scale": z.enum(["no_scale", "fit_to_frame", "stretch_to_fill", "fill_frame"]).optional(),
  "audioPreference": z.enum(["replace", "mix"]).optional()
}))
})).optional(),
  layerOperations: z.array(z.object({
  "operation": z.enum(["trim_comp", "trim_inpoint", "trim_outpoint", "shift_inpoint", "shift_outpoint", "match_source_duration", "set_layer_duration", "stretch_layer", "enable_layer"]),
  "layerId": z.string().optional(),
  "refLayerId": z.string().optional(),
  "refInOut": z.enum(["in", "out"]).optional(),
  "startLayerId": z.string().optional(),
  "endLayerId": z.string().optional(),
  "startSeconds": z.number().optional(),
  "startFrames": z.number().int().optional(),
  "offsetSeconds": z.number().optional(),
  "offsetFrames": z.number().int().optional(),
  "durationSeconds": z.number().optional(),
  "durationFrames": z.number().int().optional(),
  "durationPercent": z.number().optional(),
  "videoEnabled": z.boolean().optional(),
  "audioEnabled": z.boolean().optional(),
  "solo": z.boolean().optional()
})).optional(),
  outputs: z.array(z.object({
  "variationIndex": z.number().int(),
  "presetIndex": z.number().int(),
  "fileName": z.string().optional(),
  "destination": z.string().optional()
})).optional(),
  body: schemas.Schema_TemplateRenderRequest.optional()
}))
    .withOutput(schemas.Schema_JobStatus)
    .withMetadata({"summary":"Render template","description":"Renders one or more video variations by applying overrides and export presets. Submit up to 10 overrides per call for a subset of editable layers and get a pre-signed URL link to download the video file. For layers that are not editable, the system defaults are automatically applied at export.","useCases":["Audio Video Dynamic Graphics Render tasks that need this operation","When the workflow goal is to render template"],"projections":[{"summary":"Take returned assets","description":"Keep asset URLs or output references from the result for download or the next edit step."}]})
    .withHandler(handler)
}

/** List render jobs */
export function audio_video_list_render_jobs(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-list-render-jobs")
    .withInput(z.object({
  filter: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  "x-request-id": z.string().optional()
}))
    .withOutput(schemas.Schema_RenderJobListResponse)
    .withMetadata({"summary":"List render jobs","description":"Returns a paginated list of template render jobs owned by the authenticated caller, optionally filtered by status and creation date. **Applicable only to render jobs submitted via `POST /v1/templates/render`.** Jobs from other API types (Describe, Reframe, TLS, TTS, Avatar) are not returned. **Filter syntax (FIQL):** - `status==running` — single status equality - `status=in=(running,not_started)` — status set membership - `createdDate=ge=2026-05-01T00:00:00Z` — absolute ISO 8601 lower bound - `createdDate=ge=-P7D` — relative ISO 8601 duration (last 7 days) - Combine with `;` (AND): `status==running;createdDate=ge=-P7D` **Default filter:** all statuses, `createdDate` within the last 30 days. **Retention:** `createdDate` filter values must fall within the 30-day retention window. **Pagination:** follow `paging.nextUrl` until it is absent (last page).","useCases":["Audio Video Dynamic Graphics Render tasks that need this operation","Audio Video Manage jobs tasks that need this operation","When the workflow goal is to list render jobs"],"projections":[{"summary":"Take listed items","description":"Keep each item id and display name from the list so later steps can select one."}]})
    .withHandler(handler)
}

/** Reframe video */
export function audio_video_generate_reframed_video(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-generate-reframed-video")
    .withInput(z.object({
  video: z.object({
  "source": z.object({
  "url": z.string()
}),
  "mediaType": z.enum(["video/mp4", "video/quicktime"])
}).optional(),
  sceneEditDetection: z.boolean().optional(),
  overlays: z.array(schemas.Schema_Overlay).optional(),
  outputConfig: z.object({
  "aspectRatios": z.array(z.string())
}).optional(),
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
}).optional()
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Reframe video","description":"This endpoint enables you to reframe video using AI. Provide video input with a pre-signed URL to generate reframed video output. This API has more limited capabilities than the v2 endpoint, and may be deprecated soon. **It's recommended to use the v2 endpoint instead.**","useCases":["Audio Video Reframe tasks that need this operation","When the workflow goal is to reframe video"],"projections":[{"summary":"Take returned assets","description":"Keep asset URLs or output references from the result for download or the next edit step."}]})
    .withHandler(handler)
}

/** Transcribe media */
export function audio_video_transcribe(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-transcribe")
    .withInput(z.object({
  body: schemas.Schema_TranscribeRequest
}))
    .withOutput(schemas.Schema_FireflyJobResponse)
    .withMetadata({"summary":"Transcribe media","description":"Generates transcripts and captions for the input audio or video in the source language or in a target language.","useCases":["Audio Video Translate and lip sync tasks that need this operation","When the workflow goal is to transcribe media"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}

/** Dub audio or video */
export function audio_video_dub(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-dub")
    .withInput(z.object({
  body: schemas.Schema_DubRequest
}))
    .withOutput(schemas.Schema_FireflyJobResponse)
    .withMetadata({"summary":"Dub audio or video","description":"Generate dubbed video or audio. A composited lip sync can also be added for video dubbing.","useCases":["Audio Video Translate and lip sync tasks that need this operation","When the workflow goal is to dub audio or video"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}

/** Get available avatars */
export function audio_video_avatars(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-avatars")
    .withInput(z.object({}))
    .withOutput(schemas.Schema_SuccessfulAvatarsResponse)
    .withMetadata({"summary":"Get available avatars","description":"Retrieves the list of all available avatars for the user's enterprise.","useCases":["Audio Video Text-to-Avatar tasks that need this operation","When the workflow goal is to get available avatars"],"projections":[{"summary":"Take listed items","description":"Keep each item id and display name from the list so later steps can select one."}]})
    .withHandler(handler)
}

/** Reframe video v2 */
export function audio_video_generate_reframed_video_v2(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-generate-reframed-video-v2")
    .withInput(z.object({
  video: schemas.Schema_VideoInputV2.optional(),
  analysis: schemas.Schema_AnalysisV2.optional(),
  composition: schemas.Schema_CompositionV2.optional(),
  output: z.object({
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
}).optional(),
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
}).optional()
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Reframe video v2","description":"This endpoint enables you to reframe the input media. You can provide a video input via a pre-signed URL to generate reframed output video.","useCases":["Audio Video Reframe tasks that need this operation","When the workflow goal is to reframe video v2"],"projections":[{"summary":"Take returned assets","description":"Keep asset URLs or output references from the result for download or the next edit step."}]})
    .withHandler(handler)
}

/** Generate avatar video from text */
export function audio_video_generate_avatar(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-generate-avatar")
    .withInput(z.object({
  body: schemas.Schema_AvatarRequest
}))
    .withOutput(schemas.Schema_StatusAPIResponse)
    .withMetadata({"summary":"Generate avatar video from text","description":"Generates an avatar video from a provided transcript or audio file. You can provide the transcript either as plain text or a pre-signed URL. The API is asynchronous, so the response will include a job ID and a status URL for tracking the running job.","useCases":["Audio Video Text-to-Avatar tasks that need this operation","When the workflow goal is to generate avatar video from text"],"projections":[{"summary":"Take returned assets","description":"Keep asset URLs or output references from the result for download or the next edit step."}]})
    .withHandler(handler)
}

/** Transcribe media */
export function audio_video_transcribe__v1_transcribe(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-transcribe-transcribe")
    .withInput(z.object({
  body: schemas.Schema_TranscribeRequest
}))
    .withOutput(schemas.Schema_FireflyJobResponse)
    .withMetadata({"summary":"Transcribe media","description":"Generates transcripts for the input audio or video.","useCases":["When the workflow goal is to transcribe media"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}

/** Dub audio or video */
export function audio_video_dub__v1_dub(handler: CapabilityHandler) {
  return capabilityFor(EXT_ID, "audio-video-dub-dub")
    .withInput(z.object({
  body: schemas.Schema_DubRequest
}))
    .withOutput(schemas.Schema_FireflyJobResponse)
    .withMetadata({"summary":"Dub audio or video","description":"Generate dubbed video or audio. A composited lip sync can be added for video dubbing.","useCases":["When the workflow goal is to dub audio or video"],"projections":[{"summary":"Use the operation result","description":"Take the fields from the response that the next workflow step needs (ids or asset URLs)."}]})
    .withHandler(handler)
}
