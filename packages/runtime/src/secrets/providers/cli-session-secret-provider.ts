/**
 * @category Secrets
 */

import type {
  SecretProvider,
  SecretProviderCapabilities,
  SecretProviderHealth,
  SecretRef,
  SecretStoreInput,
  SecretValueResult,
} from "@executioncontrolprotocol/plugins";
import {
  deleteCliSessionSecret,
  getCliSessionSecret,
  listCliSessionKeys,
  putCliSessionSecret,
} from "../cli-session-store.js";
import { SESSION_PROVIDER_ID } from "../provider-ids.js";
import { secretRefIdFromLogicalKey } from "../ref.js";
import { redactSecret } from "../redaction.js";

/**
 * Ephemeral secrets for the current CLI process (`putCliSessionSecret` / `ecp config secrets add`).
 */
export class CliSessionSecretProvider implements SecretProvider {
  readonly id = SESSION_PROVIDER_ID;
  readonly displayName = "Session (ephemeral)";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  capabilities(): SecretProviderCapabilities {
    return {
      secureAtRest: false,
      interactiveUnlock: false,
      headlessSupported: true,
      persistent: false,
      supportsList: true,
      supportsDelete: true,
      supportsMetadata: false,
    };
  }

  async healthCheck(): Promise<SecretProviderHealth> {
    return { ok: true, providerId: this.id };
  }

  async store(input: SecretStoreInput): Promise<void> {
    putCliSessionSecret(input.ref.key, input.value);
  }

  async load(ref: SecretRef): Promise<SecretValueResult | null> {
    const v = getCliSessionSecret(ref.key);
    if (v === undefined) return null;
    return { value: v, redactedPreview: redactSecret(v) };
  }

  async delete(ref: SecretRef): Promise<void> {
    deleteCliSessionSecret(ref.key);
  }

  async list(): Promise<SecretRef[]> {
    return listCliSessionKeys().map((key) => ({
      id: secretRefIdFromLogicalKey(key),
      provider: this.id,
      key,
    }));
  }
}
