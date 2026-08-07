import { ECP_ENCODING_ERROR_CODES } from "@executioncontrolprotocol/types"
import type { CapabilityDefinition } from "../definitions/types.js"
import type { Registry } from "../registry/registry.js"
import {
  normalizeNamespacedId,
  validateDecodeCapabilityContract,
  validateEncodeCapabilityContract,
} from "./contracts.js"
import { EcpError } from "./errors.js"

/**
 * Resolve encode capability for an extension.
 * @category Encoding
 */
export function resolveEncoder(
  registry: Registry,
  extensionId: string
): CapabilityDefinition {
  const normalized = normalizeNamespacedId(extensionId)
  const capabilityId = `${normalized}.encode`

  const extensionDef = registry.getExtension(normalized)
  if (!extensionDef) {
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_EXTENSION_NOT_FOUND, {
      message: `Extension ${normalized} is not registered.`,
    })
  }

  const capabilityDef = registry.getCapability(capabilityId)
  if (!capabilityDef) {
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_ENCODER_NOT_FOUND, {
      message: `Extension ${normalized} does not provide ${capabilityId}.`,
    })
  }

  validateEncodeCapabilityContract(capabilityDef)
  return capabilityDef
}

/**
 * Resolve decode capability for an extension.
 * @category Encoding
 */
export function resolveDecoder(
  registry: Registry,
  extensionId: string
): CapabilityDefinition {
  const normalized = normalizeNamespacedId(extensionId)
  const capabilityId = `${normalized}.decode`

  const extensionDef = registry.getExtension(normalized)
  if (!extensionDef) {
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_EXTENSION_NOT_FOUND, {
      message: `Extension ${normalized} is not registered.`,
    })
  }

  const capabilityDef = registry.getCapability(capabilityId)
  if (!capabilityDef) {
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_DECODER_NOT_FOUND, {
      message: `Extension ${normalized} does not provide ${capabilityId}.`,
    })
  }

  validateDecodeCapabilityContract(capabilityDef)
  return capabilityDef
}
