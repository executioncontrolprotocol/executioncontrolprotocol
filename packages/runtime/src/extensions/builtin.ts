/**
 * Built-in extension registrations for core runtime providers.
 *
 * @category Extensions
 */

import type { ExtensionVersion } from "@ecp/spec";
import { OpenAIProvider } from "../providers/openai/openai-provider.js";
import type { OpenAIProviderConfig } from "../providers/openai/openai-provider.js";
import { OllamaProvider } from "../providers/ollama/ollama-provider.js";
import type { OllamaProviderConfig } from "../providers/ollama/ollama-provider.js";
import type { ExtensionRegistry } from "./registry.js";

/**
 * Configuration for registering built-in model providers.
 *
 * @category Extensions
 */
export interface BuiltinModelProviderConfig {
  /** Built-in extension version to report for registrations. */
  version?: ExtensionVersion;

  /** Default OpenAI provider configuration. */
  openai?: OpenAIProviderConfig;

  /** Default Ollama provider configuration. */
  ollama?: OllamaProviderConfig;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

/**
 * Register built-in model providers in a registry.
 */
export function registerBuiltinModelProviders(
  registry: ExtensionRegistry,
  config: BuiltinModelProviderConfig = {},
): void {
  const version = config.version ?? "0.3.0";

  registry.registerModelProvider({
    id: "openai",
    kind: "model-provider",
    sourceType: "builtin",
    version,
    description: "Built-in OpenAI model provider extension.",
    create(overrides) {
      return new OpenAIProvider({
        ...config.openai,
        ...asRecord(overrides),
      });
    },
  });

  registry.registerModelProvider({
    id: "ollama",
    kind: "model-provider",
    sourceType: "builtin",
    version,
    description: "Built-in Ollama model provider extension.",
    create(overrides) {
      return new OllamaProvider({
        ...config.ollama,
        ...asRecord(overrides),
      });
    },
  });
}

