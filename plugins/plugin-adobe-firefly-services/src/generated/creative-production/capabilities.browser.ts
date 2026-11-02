/* eslint-disable */
/** Generated Adobe creative-production browser catalog — do not edit. */
import * as shells from "./shells.js"
import { HOST_HOP_MESSAGE } from "../../shared.js"

async function hostHop(): Promise<never> {
  throw new Error(HOST_HOP_MESSAGE)
}

/** Execute a batch of assets through a workflow */
export const creative_production_batch_execute = shells.creative_production_batch_execute(hostHop)

/** List batches */
export const creative_production_list_batches = shells.creative_production_list_batches(hostHop)

/** List individual execution results */
export const creative_production_list_batch_executions = shells.creative_production_list_batch_executions(hostHop)
