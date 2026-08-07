import { registerBrowserCodingHarness } from "./browser-coding-harness.js"

let registered = false

/** Register Browser Coding harness in the global catalog. @category Harness */
export function registerBrowserCodingHarnesses(): void {
  if (registered) return
  registerBrowserCodingHarness()
  registered = true
}

/** Reset harness registration (tests). @internal */
export function resetBrowserCodingHarnessRegistrationForTests(): void {
  registered = false
}
