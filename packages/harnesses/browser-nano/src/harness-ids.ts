import { harnessCapabilityId, type HarnessCapabilityId, type HarnessId } from "@executioncontrolprotocol/types"

/** Browser Nano harness id (small on-device models; demo + eval matrix). @category Harness */
export const BROWSER_NANO_HARNESS_ID = "@executioncontrolprotocol/harness-browser-nano" as HarnessId

/** Evaluate capability for all Browser Nano harness tasks. @category Harness */
export const BROWSER_NANO_HARNESS_CAPABILITY: HarnessCapabilityId =
  harnessCapabilityId(BROWSER_NANO_HARNESS_ID)
