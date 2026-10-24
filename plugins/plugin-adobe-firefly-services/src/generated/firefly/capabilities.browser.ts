/* eslint-disable */
/** Generated Adobe firefly browser catalog — do not edit. */
import * as shells from "./shells.js"
import { HOST_HOP_MESSAGE } from "../../shared.js"

async function hostHop(): Promise<never> {
  throw new Error(HOST_HOP_MESSAGE)
}

/** Generate images */
export const firefly_generate_images_v3_async = shells.firefly_generate_images_v3_async(hostHop)

/** Generate images with Image5 */
export const firefly_generate_images_v5_async = shells.firefly_generate_images_v5_async(hostHop)

/** Generate similar images */
export const firefly_generate_similar_images_v3_async = shells.firefly_generate_similar_images_v3_async(hostHop)

/** Expand image */
export const firefly_expand_images_v3_async = shells.firefly_expand_images_v3_async(hostHop)

/** Fill image */
export const firefly_fill_images_v3_async = shells.firefly_fill_images_v3_async(hostHop)

/** Generate object composite */
export const firefly_generate_object_composite_v3_async = shells.firefly_generate_object_composite_v3_async(hostHop)

/** Generate precise composite */
export const firefly_precise_composite = shells.firefly_precise_composite(hostHop)

/** Generate adaptive composite */
export const firefly_adaptive_composite = shells.firefly_adaptive_composite(hostHop)

/** Upscale image */
export const firefly_precise_upsampler_v3_async = shells.firefly_precise_upsampler_v3_async(hostHop)

/** Generate video */
export const firefly_generate_video_v3 = shells.firefly_generate_video_v3(hostHop)

/** Retrieve custom models */
export const firefly_get_custom_models = shells.firefly_get_custom_models(hostHop)

/** Upload image */
export const firefly_storage_image_v2 = shells.firefly_storage_image_v2(hostHop)

/** Get job status */
export const firefly_job_result_v3 = shells.firefly_job_result_v3(hostHop)

/** Cancel job */
export const firefly_cancel_job_v4 = shells.firefly_cancel_job_v4(hostHop)
