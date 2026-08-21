import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import type { EnvironmentDescriptor, ValidationResult, WorkflowManifest } from "@executioncontrolprotocol/types"
import { globalRegistry } from "../registry/registry.js"
import { validateWorkflow } from "./workflow.js"
import type { ResolvedBindings } from "../environment/bindings.js"
import {
  isBrowserRuntimeId,
  resolveCapabilityExecution,
} from "../runtime/capability-execution.js"

/**
 * Whether a bound extension may live in this environment runtime.
 * Node-only packages are allowed on the browser when every capability is
 * `host` or `mixed` (catalog + hop / mixed tab work).
 */
function extensionCompatibleWithRuntime(
  extId: string,
  runtimeId: string
): boolean {
  const def = globalRegistry.getExtension(extId)
  const supported = def?.supportedRuntimes
  if (!supported?.length || supported.includes(runtimeId as (typeof supported)[number])) {
    return true
  }
  if (!isBrowserRuntimeId(runtimeId) || !def) {
    return false
  }
  // Browser may bind host/mixed catalogs that execute on `ecp up`.
  return def.capabilities.every((cap) => {
    const execution = resolveCapabilityExecution(cap, def)
    return execution === "host" || execution === "mixed"
  })
}

/** Validate workflow against a live environment. */
export function validateEnvironmentWithWorkflow(
  workflow: WorkflowManifest,
  descriptor: EnvironmentDescriptor,
  bindings: ResolvedBindings
): ValidationResult {
  const result = validateWorkflow(workflow, descriptor)
  const rtId = String(bindings.runtime.id)

  for (const ext of bindings.extensions) {
    const id = String(ext.id)
    if (!extensionCompatibleWithRuntime(id, rtId)) {
      const def = globalRegistry.getExtension(id)
      const supported = def?.supportedRuntimes ?? []
      result.valid = false
      result.errors.push({
        code: "UNSUPPORTED_RUNTIME_EXTENSION",
        message: `Extension ${id} does not support runtime ${rtId}. Supported: ${supported.join(", ")}`,
      })
    }
  }

  if (rtId === "@executioncontrolprotocol/local") {
    result.valid = false
    result.errors.push({
      code: "DEPRECATED_RUNTIME",
      message: "Runtime @executioncontrolprotocol/local was replaced by @executioncontrolprotocol/node.",
    })
  }
  result.schema = "@executioncontrolprotocol.validation.result"
  result.version = LATEST_ECP_VERSION
  return result
}
