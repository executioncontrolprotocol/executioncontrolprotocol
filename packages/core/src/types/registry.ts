import type { NamespacedId } from "./schema.js"

/** Source of a dynamic registry registration request. @category Policies */
export type RegistryRegistrationSourceType =
  | "browser-global"
  | "environment-api"
  | "direct-registry"

/** Registry operation evaluated by environment policies before acceptance. @category Policies */
export interface RegistryRegistrationRequest {
  /** Kind of definition being registered. */
  kind: "extension" | "policy" | "runtime"
  /** Namespaced id of the definition. */
  id: NamespacedId
  /** Definition payload when available. */
  definition?: unknown
  /** Whether the host will auto-bind after registration. */
  autoBindRequested?: boolean
  /** Provenance of the registration call. */
  source?: {
    /** How registration was initiated. */
    type: RegistryRegistrationSourceType
    /** Optional page URL for browser-global registration. */
    url?: string
  }
}

/** Policy evaluation scope for non-step checks. @category Policies */
export type PolicyEvaluationScope = "environment" | "run" | "step" | "invoke"
