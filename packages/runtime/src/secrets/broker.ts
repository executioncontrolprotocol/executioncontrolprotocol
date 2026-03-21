/**
 * @category Secrets
 */

import type {
  ResolvedSecret,
  SecretBroker,
  SecretPolicyMode,
  SecretProviderRegistry,
  SecretRef,
  SecretResolutionContext,
  ToolServerCredentialBinding,
} from "@executioncontrolprotocol/plugins";
import { isInsecureSecretProvider } from "./insecure.js";
import { redactSecret } from "./redaction.js";
import { secretRefFromBinding } from "./ref.js";
import { warningForProvider } from "./warnings.js";

/**
 * Resolves secrets through a {@link SecretProviderRegistry} with policy checks.
 */
export class DefaultSecretBroker implements SecretBroker {
  constructor(
    private readonly registry: SecretProviderRegistry,
    private readonly policy: SecretPolicyMode = "warn",
  ) {}

  async resolve(ref: SecretRef, _ctx?: SecretResolutionContext): Promise<ResolvedSecret> {
    const provider = this.registry.get(ref.provider);
    if (!provider) {
      throw new Error(`Unknown secret provider "${ref.provider}".`);
    }
    const available = await provider.isAvailable();
    if (!available) {
      throw new Error(`Secret provider "${ref.provider}" is not available on this system.`);
    }

    const insecure = isInsecureSecretProvider(ref.provider);
    if (insecure && this.policy === "strict" && !_ctx?.allowInsecureForBinding) {
      throw new Error(
        `Secret provider "${ref.provider}" is not allowed when secrets.policy is "strict". ` +
          `Set allowInsecure: true on the binding, or use a secure provider (e.g. os.secrets).`,
      );
    }

    const warnings: string[] = [];
    const w = warningForProvider(ref.provider);
    if (insecure && this.policy === "warn" && w) {
      warnings.push(w);
    }

    const loaded = await provider.load(ref);
    if (loaded == null) {
      throw new Error(
        `Secret not found for provider "${ref.provider}" key "${ref.key}".`,
      );
    }

    return {
      ref,
      value: loaded.value,
      redactedPreview: loaded.redactedPreview,
      providerId: ref.provider,
      warnings,
    };
  }

  async resolveMany(refs: SecretRef[], ctx?: SecretResolutionContext): Promise<ResolvedSecret[]> {
    return Promise.all(refs.map((r) => this.resolve(r, ctx)));
  }

  async resolveBinding(
    binding: ToolServerCredentialBinding,
    _ctx?: SecretResolutionContext,
  ): Promise<ResolvedSecret> {
    const ref = secretRefFromBinding(binding);
    const provider = this.registry.get(ref.provider);
    if (!provider) {
      throw new Error(`Unknown secret provider "${ref.provider}".`);
    }
    const available = await provider.isAvailable();
    if (!available) {
      throw new Error(`Secret provider "${ref.provider}" is not available on this system.`);
    }

    const insecure = isInsecureSecretProvider(ref.provider);
    if (insecure && this.policy === "strict" && !binding.allowInsecure) {
      throw new Error(
        `Secret provider "${ref.provider}" is not allowed when secrets.policy is "strict". ` +
          `Set allowInsecure: true on the binding, or use os.secrets.`,
      );
    }

    const warnings: string[] = [];
    const w = warningForProvider(ref.provider);
    if (insecure && this.policy === "warn" && w) {
      warnings.push(w);
    }

    const loaded = await provider.load(ref);
    if (loaded == null) {
      if (binding.required) {
        throw new Error(
          `Required secret "${binding.name}" not found (provider "${ref.provider}", key "${ref.key}").`,
        );
      }
      return {
        ref,
        value: "",
        redactedPreview: redactSecret(""),
        providerId: ref.provider,
        warnings,
      };
    }

    return {
      ref,
      value: loaded.value,
      redactedPreview: loaded.redactedPreview,
      providerId: ref.provider,
      warnings,
    };
  }

  async resolveBindingsToEnv(
    bindings: ToolServerCredentialBinding[],
    ctx?: SecretResolutionContext,
  ): Promise<{ env: Record<string, string>; warnings: string[] }> {
    const env: Record<string, string> = {};
    const warnings: string[] = [];
    for (const b of bindings) {
      const delivery = b.delivery ?? "env";
      if (delivery !== "env") continue;
      const resolved = await this.resolveBinding(b, ctx);
      warnings.push(...resolved.warnings);
      if (resolved.value !== "" || !b.required) {
        if (resolved.value !== "") {
          env[b.name] = resolved.value;
        }
      }
    }
    return { env, warnings };
  }
}
