/* eslint-disable */
/** Generated Adobe illustrator browser catalog — do not edit. */
import * as shells from "./shells.js"
import { HOST_HOP_MESSAGE } from "../../shared.js"

async function hostHop(): Promise<never> {
  throw new Error(HOST_HOP_MESSAGE)
}

/** Submit a Custom Script */
export const illustrator_register_custom_script_capability = shells.illustrator_register_custom_script_capability(hostHop)

/** Submit a custom script execution request */
export const illustrator_execute_custom_script_capability = shells.illustrator_execute_custom_script_capability(hostHop)

/** Data merge */
export const illustrator_data_merge = shells.illustrator_data_merge(hostHop)

/** Create rendition */
export const illustrator_create_rendition = shells.illustrator_create_rendition(hostHop)

/** Submit a job */
export const illustrator_trace_image = shells.illustrator_trace_image(hostHop)
