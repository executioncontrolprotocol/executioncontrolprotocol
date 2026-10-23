/* eslint-disable */
/** Generated Adobe photoshop browser catalog — do not edit. */
import * as shells from "./shells.js"
import { HOST_HOP_MESSAGE } from "../../shared.js"

async function hostHop(): Promise<never> {
  throw new Error(HOST_HOP_MESSAGE)
}

/** Auto crop */
export const photoshop_auto_crop = shells.photoshop_auto_crop(hostHop)

/** Create an artboard */
export const photoshop_create_artboard = shells.photoshop_create_artboard(hostHop)

/** Create or edit a composite */
export const photoshop_create_composite = shells.photoshop_create_composite(hostHop)

/** Edit an image with various adjustments */
export const photoshop_edit = shells.photoshop_edit(hostHop)

/** Execute Photoshop actions, scripts, and transformations */
export const photoshop_execute_actions = shells.photoshop_execute_actions(hostHop)

/** Generate a manifest for given input image */
export const photoshop_generate_manifest = shells.photoshop_generate_manifest(hostHop)

/** Get Job Status */
export const photoshop_get_job_status = shells.photoshop_get_job_status(hostHop)
