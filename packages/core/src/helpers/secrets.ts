import type { SecretValue } from "@executioncontrolprotocol/types"

/** Options for OS secret refs. */
export interface SecretsOptions {
  optional?: boolean
  fallback?: unknown
}

/**
 * OS secrets store reference (environment setup only).
 * @category Environment
 */
export function secrets(key: string, options?: SecretsOptions): SecretValue {
  return {
    $secret: key,
    ...(options?.optional !== undefined ? { optional: options.optional } : {}),
    ...(options?.fallback !== undefined ? { fallback: options.fallback } : {}),
  }
}
