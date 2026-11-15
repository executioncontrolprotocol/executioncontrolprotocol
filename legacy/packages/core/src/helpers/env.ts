import type { EnvValue } from "../types/index.js"

/** Options for environment variable refs. */
export interface EnvOptions {
  optional?: boolean
  fallback?: unknown
}

/**
 * Environment config reference (environment setup only).
 * @category Environment
 */
export function env(name: string, options?: EnvOptions): EnvValue {
  return {
    $env: name,
    ...(options?.optional !== undefined ? { optional: options.optional } : {}),
    ...(options?.fallback !== undefined ? { fallback: options.fallback } : {}),
  }
}
