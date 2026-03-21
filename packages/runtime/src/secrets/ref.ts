/**
 * @category Secrets
 */

import type { SecretRef, ToolServerCredentialBinding } from "@executioncontrolprotocol/plugins";
import { ECP_SECRET_REF_PROTOCOL_PREFIX } from "./constants.js";

/**
 * Normalize a binding / keyring logical key (trim, backslashes → `/`).
 */
export function canonicalSecretKeyForBinding(key: string): string {
  return key.trim().replace(/\\/g, "/");
}

/**
 * Default secret ref id: {@link ECP_SECRET_REF_PROTOCOL_PREFIX} plus the normalized key. The provider id lives on {@link SecretRef.provider}
 * (e.g. `source.provider: os.secrets` with `key: MY_KEY`, or shorthand `os.secrets.MY_KEY`), not in the URI.
 */
export function secretRefIdFromLogicalKey(key: string): string {
  return `${ECP_SECRET_REF_PROTOCOL_PREFIX}${canonicalSecretKeyForBinding(key)}`;
}

/**
 * Build a {@link SecretRef} from a tool-server credential binding.
 */
export function secretRefFromBinding(binding: ToolServerCredentialBinding): SecretRef {
  const { provider, key, refId } = binding.source;
  const k = canonicalSecretKeyForBinding(key);
  return {
    id: refId ?? secretRefIdFromLogicalKey(key),
    provider,
    key: k,
  };
}
