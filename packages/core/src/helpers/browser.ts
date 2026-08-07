import type { BrowserValue } from "@executioncontrolprotocol/types"

/** Options for browser encrypted secret refs. */
export interface BrowserOptions {
  optional?: boolean
  fallback?: unknown
}

/**
 * Browser encrypted secrets vault reference (environment setup only).
 * @category Environment
 */
export function browser(key: string, options?: BrowserOptions): BrowserValue {
  return {
    $browser: key,
    ...(options?.optional !== undefined ? { optional: options.optional } : {}),
    ...(options?.fallback !== undefined ? { fallback: options.fallback } : {}),
  }
}
