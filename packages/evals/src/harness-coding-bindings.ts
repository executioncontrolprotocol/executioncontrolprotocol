/**
 * Eval-facing Browser Coding harness API.
 * @category Evals
 */
export {
  registerBrowserCodingHarnesses,
  resetBrowserCodingHarnessRegistrationForTests,
  BROWSER_CODING_HARNESS_ID,
  BROWSER_CODING_HARNESS_CAPABILITY,
  HARNESS_TASKS,
  HARNESS_CODING_REPAIR,
  HARNESS_CODING_REPAIR_SMALL,
  HARNESS_CODING_REPAIR_MEDIUM,
  HARNESS_CODING_REPAIR_FRONTIER,
  HARNESS_CODING_TRACE,
  HARNESS_CODING_BINDING,
  HARNESS_CODING_BINDING_SMALL,
  HARNESS_CODING_BINDING_MEDIUM,
  HARNESS_CODING_BINDING_FRONTIER,
  getHarnessCodingConfig,
  codingHarnessBindingForProfile,
  resolveEffectiveCodingProfile,
  normalizeHarnessCodingProfile,
  type HarnessTask,
  type HarnessCodingProfile,
} from "@executioncontrolprotocol/harnesses-browser-coding"
