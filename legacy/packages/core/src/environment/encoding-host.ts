import type { Registry } from "../registry/registry.js"

/**
 * Minimal environment surface required by encode/decode builders.
 * @category Environment
 * @internal
 */
export interface EncodingEnvironmentHost {
  /** Register extension definitions for bound extensions. */
  ensureBoundExtensionsRegistered(): Promise<void>
  /** Environment id. */
  getEnvId(): string
  /** Optional environment label. */
  getEnvLabel(): string | undefined
  /** Definition registry. */
  getRegistry(): Registry
}
