import {
  ECP_CORE_FORMATTER_IDS,
  ECP_HARNESS_ERROR_CODES,
  ECP_MODEL_CAPABILITY_NAME,
  type HarnessId,
  type ValidationIssue,
  type ValidationResult,
} from "@executioncontrolprotocol/types"
import type { Registry } from "../registry/registry.js"
import type { ResolvedBindings } from "../environment/bindings.js"
import { getCatalogedHarness } from "../harness/harness-catalog.js"
import { isCoreFormatterId, isFormatterRegistered } from "../harness/format-resolve.js"
import { emptyValidationResult } from "./workflow-schema.js"

function issue(code: string, message: string, path?: string): ValidationIssue {
  return { severity: "error", code, message, ...(path ? { path } : {}) }
}

function isBoundExtension(bindings: ResolvedBindings, extId: string): boolean {
  return bindings.extensions.some((e) => e.id === extId)
}

/**
 * Validate harness bindings against registry and environment extensions.
 * @category Harness
 */
export function validateHarnessBindings(
  registry: Registry,
  bindings: ResolvedBindings
): ValidationResult {
  const result = emptyValidationResult(true)
  const harnesses = bindings.harnesses ?? []

  for (let i = 0; i < harnesses.length; i++) {
    const b = harnesses[i]
    const path = `harnesses[${i}]`
    const def = getCatalogedHarness(b.id)
    if (!def) {
      result.valid = false
      result.errors.push(
        issue(
          ECP_HARNESS_ERROR_CODES.UNKNOWN_HARNESS,
          `Harness ${b.id} is not registered.`,
          `${path}.id`
        )
      )
      continue
    }

    if (!b.uses) {
      result.valid = false
      result.errors.push(
        issue(
          ECP_HARNESS_ERROR_CODES.UNKNOWN_HARNESS_PROVIDER,
          `Harness ${b.id} requires .uses(provider.generate).`,
          `${path}.uses`
        )
      )
      continue
    }

    const providerExtId = b.uses.replace(/\.[^.]+$/, "") as HarnessId
    const capName = b.uses.split(".").pop()
    if (capName !== ECP_MODEL_CAPABILITY_NAME) {
      result.valid = false
      result.errors.push(
        issue(
          ECP_HARNESS_ERROR_CODES.HARNESS_PROVIDER_CONTRACT_MISMATCH,
          `Harness provider ${b.uses} must end with .${ECP_MODEL_CAPABILITY_NAME}.`,
          `${path}.uses`
        )
      )
    }

    if (!isBoundExtension(bindings, providerExtId)) {
      result.valid = false
      result.errors.push(
        issue(
          ECP_HARNESS_ERROR_CODES.UNKNOWN_HARNESS_PROVIDER,
          `Harness ${b.id} uses ${b.uses}, but ${providerExtId} is not bound in this environment.`,
          `${path}.uses`
        )
      )
    } else if (!registry.getCapability(b.uses)) {
      result.valid = false
      result.errors.push(
        issue(
          ECP_HARNESS_ERROR_CODES.UNKNOWN_HARNESS_PROVIDER,
          `Capability ${b.uses} is not registered.`,
          `${path}.uses`
        )
      )
    }

    const output = b.config.output as { format?: string } | undefined
    const formatId = output?.format
    if (formatId) {
      if (!isFormatterRegistered(formatId)) {
        result.valid = false
        result.errors.push(
          issue(
            ECP_HARNESS_ERROR_CODES.UNKNOWN_OUTPUT_FORMAT,
            `Formatter ${formatId} is not registered.`,
            `${path}.config.output.format`
          )
        )
      } else if (!isCoreFormatterId(formatId) && !isBoundExtension(bindings, formatId)) {
        result.valid = false
        result.errors.push(
          issue(
            ECP_HARNESS_ERROR_CODES.UNKNOWN_OUTPUT_FORMAT,
            `Harness ${b.id} references ${formatId}, but that formatter is not bound.`,
            `${path}.config.output.format`
          )
        )
      }
    }

    const descriptorFormat = (b.config.context as { descriptorFormat?: string } | undefined)
      ?.descriptorFormat
    if (
      descriptorFormat &&
      !isCoreFormatterId(descriptorFormat) &&
      !isFormatterRegistered(descriptorFormat)
    ) {
      result.valid = false
      result.errors.push(
        issue(
          ECP_HARNESS_ERROR_CODES.UNKNOWN_OUTPUT_FORMAT,
          `Unknown descriptor format ${descriptorFormat}.`,
          `${path}.config.context.descriptorFormat`
        )
      )
    }
  }

  result.schema = "@executioncontrolprotocol.validation.result"
  return result
}

/** Known core formatter ids for tests. @internal */
export { ECP_CORE_FORMATTER_IDS }
