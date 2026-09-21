/* eslint-disable */
/** Generated Adobe audio-video capabilities — do not edit. */
import * as shells from "./shells.js"
import { z } from "zod"
import * as schemas from "./schemas.js"
import { invokeAdobeOperation } from "../../runtime/invoke.js"

/** Get available voices */
export const audio_video_voices = shells.audio_video_voices(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v1/voices",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_SuccessfulVoicesResponse,
    asyncMode: "none",
  })
})

/** Generate speech from text */
export const audio_video_generate_speech = shells.audio_video_generate_speech(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/generate-speech",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_StatusAPIResponse,
    asyncMode: "submit",
  })
})

/** Get job status */
export const audio_video_status = shells.audio_video_status(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v1/status/{jobId}",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_StatusAPIResponse,
    asyncMode: "none",
  })
})

/** Describe template */
export const audio_video_template_describe = shells.audio_video_template_describe(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/templates/describe",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_StatusAPIResponse,
    asyncMode: "submit",
  })
})

/** Fetch video rendering presets */
export const audio_video_get_presets = shells.audio_video_get_presets(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v1/presets",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_PresetsResponse,
    asyncMode: "none",
  })
})

/** Render template */
export const audio_video_template_render = shells.audio_video_template_render(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/templates/render",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_JobStatus,
    asyncMode: "submit",
  })
})

/** Cancel a render job */
export const audio_video_cancel_render_job = shells.audio_video_cancel_render_job(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "PUT",
    pathTemplate: "/v1/cancel/{jobId}",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_CancelAcceptedResponse,
    asyncMode: "none",
  })
})

/** List render jobs */
export const audio_video_list_render_jobs = shells.audio_video_list_render_jobs(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v1/templates/render-jobs",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_RenderJobListResponse,
    asyncMode: "none",
  })
})

/** Reframe video */
export const audio_video_generate_reframed_video = shells.audio_video_generate_reframed_video(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/reframe",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_StatusAPIResponse,
    asyncMode: "submit",
  })
})

/** Transcribe media */
export const audio_video_transcribe = shells.audio_video_transcribe(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/transcribe",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_FireflyJobResponse,
    asyncMode: "submit",
  })
})

/** Dub audio or video */
export const audio_video_dub = shells.audio_video_dub(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/dub",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_FireflyJobResponse,
    asyncMode: "submit",
  })
})

/** Get available avatars */
export const audio_video_avatars = shells.audio_video_avatars(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v1/avatars",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_SuccessfulAvatarsResponse,
    asyncMode: "none",
  })
})

/** Reframe video v2 */
export const audio_video_generate_reframed_video_v2 = shells.audio_video_generate_reframed_video_v2(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v2/reframe",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_StatusAPIResponse,
    asyncMode: "submit",
  })
})

/** Get job result */
export const audio_video_job_result_v2 = shells.audio_video_job_result_v2(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v2/status/{jobId}",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: z.union([z.object({
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
})]),
    asyncMode: "none",
  })
})

/** Generate avatar video from text */
export const audio_video_generate_avatar = shells.audio_video_generate_avatar(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/generate-avatar",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_StatusAPIResponse,
    asyncMode: "submit",
  })
})

/** Transcribe media */
export const audio_video_transcribe__v1_transcribe = shells.audio_video_transcribe__v1_transcribe(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/transcribe",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_FireflyJobResponse,
    asyncMode: "submit",
  })
})

/** Dub audio or video */
export const audio_video_dub__v1_dub = shells.audio_video_dub__v1_dub(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "POST",
    pathTemplate: "/v1/dub",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
        pollIntervalMs?: number
        pollTimeoutMs?: number
    },
    ctx,
    outputSchema: schemas.Schema_FireflyJobResponse,
    asyncMode: "submit",
  })
})

/** Get the result for a job */
export const audio_video_job_result = shells.audio_video_job_result(async (input, ctx) => {
  return invokeAdobeOperation({
    method: "GET",
    pathTemplate: "/v1/status/{jobId}",
    baseUrl: "https://audio-video-api.adobe.io/",
    input: input as {
        path?: Record<string, string | number | boolean>
        query?: Record<string, string | number | boolean | undefined>
        headers?: Record<string, string>
        body?: unknown
    },
    ctx,
    outputSchema: schemas.Schema_FireflyJobResponse,
    asyncMode: "none",
  })
})
