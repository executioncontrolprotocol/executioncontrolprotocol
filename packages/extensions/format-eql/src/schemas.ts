import type {
  DecodeCapabilityInput,
  EcpDecodeOptions,
  EcpFormatOptions,
  EncodeCapabilityInput,
} from "@executioncontrolprotocol/types"
import { z } from "zod"

/** EQL-specific format options (intersect with {@link EcpFormatOptions}). @category Encoding */
export interface EqlFormatOptions {
  preserveIds?: boolean
  quote?: "auto" | "always"
  indent?: number
}

export const eqlFormatOptionsSchema = z
  .object({
    headers: z.boolean().optional(),
    strict: z.boolean().optional(),
    preserveIds: z.boolean().optional(),
    quote: z.enum(["auto", "always"]).optional(),
    indent: z.number().int().positive().optional(),
  })
  .passthrough()

export type EqlEncodeInput<T = unknown> = EncodeCapabilityInput<
  T,
  EcpFormatOptions & EqlFormatOptions
>

export type EqlDecodeInput = DecodeCapabilityInput<EcpDecodeOptions & EqlFormatOptions>

export function resolveEqlOptions(
  options?: (EcpFormatOptions | EcpDecodeOptions) & EqlFormatOptions
): Required<Pick<EqlFormatOptions, "preserveIds" | "quote" | "indent">> & {
  headers: boolean
  strict: boolean
} {
  const headers = options?.headers
  const includeHeader =
    headers === undefined || headers === true || headers === "auto"
  return {
    headers: includeHeader,
    strict: options?.strict !== false,
    preserveIds: options?.preserveIds !== false,
    quote: options?.quote ?? "auto",
    indent: options?.indent ?? 2,
  }
}
