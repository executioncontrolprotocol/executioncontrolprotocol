import { ECP_ENVIRONMENT_UNSUPPORTED, LATEST_ECP_VERSION } from "../types/index.js"
import type { EnvironmentDescriptor, ValidationResult, WorkflowManifest } from "../types/index.js"
import { validateWorkflow } from "./workflow.js"
import type { ResolvedBindings } from "../environment/bindings.js"
import {
  isBrowserEnvironmentId,
  resolveCapabilityExecution,
} from "../runtime/capability-execution.js"
import type { Registry } from "../registry/registry.js"
import type { ExtensionDefinition, SupportedEnvironment } from "../definitions/types.js"
import { satisfies } from "semver"

export { ECP_ENVIRONMENT_UNSUPPORTED }

function formatSupported(supported: SupportedEnvironment[]): string {
  return supported
    .map((s) => (s.range ? `${s.id}@${s.range}` : s.id))
    .join(", ")
}

function environmentMatches(
  supported: SupportedEnvironment[] | undefined,
  environmentId: string,
  environmentVersion?: string
): boolean {
  if (!supported?.length) return true
  const match = supported.find((s) => s.id === environmentId)
  if (!match) return false
  if (!match.range) return true
  if (!environmentVersion) return false
  return satisfies(environmentVersion, match.range)
}

/**
 * Whether a bound extension may live in this environment.
 * Node-only packages are allowed on the browser when every capability is
 * `host` or `mixed` (catalog + hop / mixed tab work).
 */
function extensionCompatibleWithEnvironment(
  def: ExtensionDefinition | undefined,
  environmentId: string,
  environmentVersion?: string
): boolean {
  const supported = def?.supportedEnvironments
  if (environmentMatches(supported, environmentId, environmentVersion)) {
    return true
  }
  if (!isBrowserEnvironmentId(environmentId) || !def) {
    return false
  }
  return def.capabilities.every((cap) => {
    const execution = resolveCapabilityExecution(cap, def)
    return execution === "host" || execution === "mixed"
  })
}

/** Validate workflow against a live environment. */
export function validateEnvironmentWithWorkflow(
  workflow: WorkflowManifest,
  descriptor: EnvironmentDescriptor,
  bindings: ResolvedBindings,
  registry: Registry,
  environmentVersion?: string
): ValidationResult {
  const result = validateWorkflow(workflow, descriptor)
  const envId = String(bindings.runtime.id)

  for (const ext of bindings.extensions) {
    const id = String(ext.id)
    const def = registry.getExtension(id)
    if (!extensionCompatibleWithEnvironment(def, envId, environmentVersion)) {
      const supported = def?.supportedEnvironments ?? []
      result.valid = false
      result.errors.push({
        code: ECP_ENVIRONMENT_UNSUPPORTED,
        message: `Extension ${id} does not support environment ${envId}. Supported: ${formatSupported(supported) || "(none)"}`,
        path: `extensions.${id}`,
        suggestions: supported.map((s) => s.id),
        severity: "error",
      })
    }
  }

  if (envId === "@executioncontrolprotocol/local") {
    result.valid = false
    result.errors.push({
      code: "DEPRECATED_RUNTIME",
      message: "Environment @executioncontrolprotocol/local was replaced by @executioncontrolprotocol/node.",
    })
  }
  result.schema = "@executioncontrolprotocol.validation.result"
  result.version = LATEST_ECP_VERSION
  return result
}
