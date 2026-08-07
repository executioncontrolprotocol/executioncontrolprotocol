import { ECP_ENCODING_ERROR_CODES } from "@executioncontrolprotocol/types"
import type { EcpDecodeInput, EcpEncodeInput } from "@executioncontrolprotocol/types"
import type { CapabilityDefinition } from "../definitions/types.js"
import { ecpDecodeInputSchema, ecpEncodeInputSchema } from "./schemas.js"
import type { UtilityCapabilityContext } from "./utility-context.js"
import { EcpError } from "./errors.js"

/**
 * Invoke an encode capability handler outside workflow execution.
 * @category Encoding
 */
export async function invokeEncodeCapability(
  cap: CapabilityDefinition,
  input: EcpEncodeInput,
  ctx: UtilityCapabilityContext
): Promise<unknown> {
  const parsed = ecpEncodeInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_ENCODE_FAILED, {
      message: `Invalid encode input: ${parsed.error.message}`,
    })
  }
  try {
    return await cap.handler(parsed.data, ctx as never)
  } catch (err) {
    if (err instanceof EcpError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_ENCODE_FAILED, {
      message: `Encode failed: ${message}`,
    })
  }
}

/**
 * Invoke a decode capability handler outside workflow execution.
 * @category Encoding
 */
export async function invokeDecodeCapability(
  cap: CapabilityDefinition,
  input: EcpDecodeInput,
  ctx: UtilityCapabilityContext
): Promise<unknown> {
  const parsed = ecpDecodeInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED, {
      message: `Invalid decode input: ${parsed.error.message}`,
    })
  }
  try {
    return await cap.handler(parsed.data, ctx as never)
  } catch (err) {
    if (err instanceof EcpError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED, {
      message: `Decode failed: ${message}`,
    })
  }
}
