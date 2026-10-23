/* eslint-disable */
/** Generated Adobe audio-video browser catalog — do not edit. */
import * as shells from "./shells.js"
import { HOST_HOP_MESSAGE } from "../../shared.js"

async function hostHop(): Promise<never> {
  throw new Error(HOST_HOP_MESSAGE)
}

/** Get available voices */
export const audio_video_voices = shells.audio_video_voices(hostHop)

/** Generate speech from text */
export const audio_video_generate_speech = shells.audio_video_generate_speech(hostHop)

/** Get job status */
export const audio_video_status = shells.audio_video_status(hostHop)

/** Describe template */
export const audio_video_template_describe = shells.audio_video_template_describe(hostHop)

/** Fetch video rendering presets */
export const audio_video_get_presets = shells.audio_video_get_presets(hostHop)

/** Render template */
export const audio_video_template_render = shells.audio_video_template_render(hostHop)

/** Cancel a render job */
export const audio_video_cancel_render_job = shells.audio_video_cancel_render_job(hostHop)

/** List render jobs */
export const audio_video_list_render_jobs = shells.audio_video_list_render_jobs(hostHop)

/** Reframe video */
export const audio_video_generate_reframed_video = shells.audio_video_generate_reframed_video(hostHop)

/** Transcribe media */
export const audio_video_transcribe = shells.audio_video_transcribe(hostHop)

/** Dub audio or video */
export const audio_video_dub = shells.audio_video_dub(hostHop)

/** Get available avatars */
export const audio_video_avatars = shells.audio_video_avatars(hostHop)

/** Reframe video v2 */
export const audio_video_generate_reframed_video_v2 = shells.audio_video_generate_reframed_video_v2(hostHop)

/** Get job result */
export const audio_video_job_result_v2 = shells.audio_video_job_result_v2(hostHop)

/** Generate avatar video from text */
export const audio_video_generate_avatar = shells.audio_video_generate_avatar(hostHop)

/** Transcribe media */
export const audio_video_transcribe__v1_transcribe = shells.audio_video_transcribe__v1_transcribe(hostHop)

/** Dub audio or video */
export const audio_video_dub__v1_dub = shells.audio_video_dub__v1_dub(hostHop)

/** Get the result for a job */
export const audio_video_job_result = shells.audio_video_job_result(hostHop)
