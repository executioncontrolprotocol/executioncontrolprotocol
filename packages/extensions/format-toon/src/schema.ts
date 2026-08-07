import type { EcpSchema } from "@executioncontrolprotocol/types"

/**
 * Infer ECP schema discriminator from a document object.
 * @category Encoding
 */
export function getEcpSchema(value: unknown): EcpSchema | undefined {
  if (value !== null && typeof value === "object" && "schema" in value) {
    const s = (value as { schema: unknown }).schema
    if (typeof s === "string") return s as EcpSchema
  }
  return undefined
}
