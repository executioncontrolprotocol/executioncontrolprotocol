/**
 * Model provider policy: wiring (`models.providers.*.supportedModels`) vs security (`security.models.allowedModels`).
 *
 * @category Engine
 */

import type { ECPSystemConfig, ModelProviderConfig } from "./types.js";
import { getSecurityConfig } from "./system-config-loader.js";

/** Built-in default model when config omits `defaultModel` (matches built-in providers). */
const BUILTIN_DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-4o",
  ollama: "gemma3:1b",
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.5-flash",
  mistral: "mistral-small-latest",
};

/**
 * Supported models for a provider on this host: explicit `supportedModels`, or `[defaultModel]` when
 * `supportedModels` is absent/empty but `defaultModel` is set.
 *
 * @category Engine
 */
export function getEffectiveSupportedModels(block: ModelProviderConfig | undefined): string[] | undefined {
  if (!block) return undefined;
  if (block.supportedModels && block.supportedModels.length > 0) {
    return block.supportedModels;
  }
  if (block.defaultModel) {
    return [block.defaultModel];
  }
  return undefined;
}

/**
 * Resolved model name for policy checks: CLI override, then config default, then built-in default for the provider.
 *
 * @category Engine
 */
export function resolveEffectiveModelNameForProvider(
  providerId: string,
  selectedModel: string | undefined,
  systemConfig: ECPSystemConfig | undefined,
): string {
  const block = systemConfig?.models?.providers?.[providerId];
  if (selectedModel) return selectedModel;
  if (block?.defaultModel) return block.defaultModel;
  return BUILTIN_DEFAULT_MODEL[providerId] ?? "gpt-4o";
}

/**
 * Returns an error message when the model is not permitted, or undefined when allowed.
 *
 * @category Engine
 */
export function modelNotAllowedMessage(
  providerId: string,
  modelName: string,
  systemConfig: ECPSystemConfig | undefined,
): string | undefined {
  const block = systemConfig?.models?.providers?.[providerId];
  const supported = getEffectiveSupportedModels(block);
  if (!supported?.length) {
    return (
      `Model "${modelName}" cannot be used for provider "${providerId}": models.providers.${providerId} has no supportedModels and no defaultModel.\n` +
        `Configure supportedModels (or defaultModel) in ecp.config.yaml.`
    );
  }
  if (!supported.includes(modelName)) {
    return (
      `Model "${modelName}" is not supported for provider "${providerId}" on this host.\n` +
        `Supported models: ${supported.join(", ")}\n` +
        `Update models.providers.${providerId}.supportedModels or the Context/CLI model selection.`
    );
  }

  const sec = getSecurityConfig(systemConfig);
  const allowProviders = sec?.models?.allowProviders;
  const policyMap = sec?.models?.allowedModels;
  const policyForProvider = policyMap?.[providerId];

  const mustEnforcePolicyList =
    (allowProviders && allowProviders.length > 0 && allowProviders.includes(providerId)) ||
    (policyForProvider !== undefined && policyForProvider.length > 0);

  if (mustEnforcePolicyList) {
    if (!policyForProvider || policyForProvider.length === 0) {
      return (
        `Model policy for provider "${providerId}" is incomplete: security.models.allowedModels.${providerId} must be a non-empty list when the provider is in security.models.allowProviders (or when policy lists models for this provider).\n` +
          `Use: ecp config security models allowed-models add ${providerId} <model>`
      );
    }
    if (!policyForProvider.includes(modelName)) {
      return (
        `Model "${modelName}" is not allowed by security policy for provider "${providerId}".\n` +
          `Allowed by security: ${policyForProvider.join(", ")}\n` +
          `Update security.models.allowedModels in ecp.config.yaml or ecp config security models allowed-models.`
      );
    }
  }

  return undefined;
}

/**
 * Throws if the model is not permitted for the provider under merged system config.
 *
 * @category Engine
 */
export function assertModelAllowedForProvider(
  providerId: string,
  modelName: string,
  systemConfig: ECPSystemConfig | undefined,
): void {
  const msg = modelNotAllowedMessage(providerId, modelName, systemConfig);
  if (msg) throw new Error(msg);
}
