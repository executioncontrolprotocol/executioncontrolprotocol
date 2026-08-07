import { registerBrowserNanoHarness } from "./browser-nano-harness.js"

let registered = false

/** Register Browser Nano harness in the global catalog. @category Harness */
export function registerBrowserNanoHarnesses(): void {
  if (registered) return
  registerBrowserNanoHarness()
  registered = true
}

/** Reset harness registration (tests). @internal */
export function resetBrowserNanoHarnessRegistrationForTests(): void {
  registered = false
}
