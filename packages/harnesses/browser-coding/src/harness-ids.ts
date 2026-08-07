import { harnessCapabilityId, type HarnessCapabilityId, type HarnessId } from "@executioncontrolprotocol/types"

/** Browser Coding harness id (stronger local coding models; eval matrix). @category Harness */
export const BROWSER_CODING_HARNESS_ID = "@executioncontrolprotocol/harness-browser-coding" as HarnessId

/** Evaluate capability for all Browser Coding harness tasks. @category Harness */
export const BROWSER_CODING_HARNESS_CAPABILITY: HarnessCapabilityId =
  harnessCapabilityId(BROWSER_CODING_HARNESS_ID)
