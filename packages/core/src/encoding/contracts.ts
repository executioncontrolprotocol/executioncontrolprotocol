import { ECP_ENCODING_ERROR_CODES } from "@executioncontrolprotocol/types"
import type { CapabilityDefinition } from "../definitions/types.js"
import { EcpError } from "./errors.js"
import { ecpEncodeInputSchema } from "./schemas.js"

/**
 * Validate that a capability matches the encode contract.
 * @category Encoding
 */
export function validateEncodeCapabilityContract(cap: CapabilityDefinition): void {
  if (!cap.inputSchema || !cap.outputSchema) {
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_ENCODER_INVALID_CONTRACT, {
      message: `Capability ${cap.id} must define input and output schemas for encode.`,
    })
  }
  const inputOk = ecpEncodeInputSchema.safeParse({ source: {} }).success
  if (!inputOk) {
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_ENCODER_INVALID_CONTRACT, {
      message: `Capability ${cap.id} encode input schema is incompatible.`,
    })
  }
}

/**
 * Validate that a capability matches the decode contract.
 * @category Encoding
 */
export function validateDecodeCapabilityContract(cap: CapabilityDefinition): void {
  if (!cap.inputSchema || !cap.outputSchema) {
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_DECODER_INVALID_CONTRACT, {
      message: `Capability ${cap.id} must define input and output schemas for decode.`,
    })
  }
}

/**
 * Normalize extension id to namespaced form.
 * @category Encoding
 */
export function normalizeNamespacedId(extensionId: string): string {
  if (extensionId.startsWith("@")) return extensionId
  return `@executioncontrolprotocol/${extensionId}`
}
