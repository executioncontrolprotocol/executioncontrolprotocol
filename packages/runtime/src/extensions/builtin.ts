/**
 * Built-in extension registrations for core runtime providers.
 *
 * @category Extensions
 */

import type { ExtensionVersion } from "@executioncontrolprotocol/spec";
import type { ModelProvider, ProgressCallback } from "@executioncontrolprotocol/plugins";
import { OpenAIProvider } from "../providers/openai/openai-provider.js";
import type { OpenAIProviderConfig } from "../providers/openai/openai-provider.js";
import { OllamaProvider } from "../providers/ollama/ollama-provider.js";
import type { OllamaProviderConfig } from "../providers/ollama/ollama-provider.js";
import { AnthropicProvider } from "../providers/anthropic/anthropic-provider.js";
import type { AnthropicProviderConfig } from "../providers/anthropic/anthropic-provider.js";
import { GeminiProvider } from "../providers/gemini/gemini-provider.js";
import type { GeminiProviderConfig } from "../providers/gemini/gemini-provider.js";
import { MistralProvider } from "../providers/mistral/mistral-provider.js";
import type { MistralProviderConfig } from "../providers/mistral/mistral-provider.js";
import { createFileLogger } from "./loggers/file-logger.js";
import type { FileLoggerConfig } from "./loggers/file-logger.js";
import { registerBuiltinMemoryPlugin } from "../plugins/memory/index.js";
import { BUILTIN_PLUGIN_VERSION } from "./builtin-defaults.js";
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

  /** Default Anthropic provider configuration. */
  anthropic?: AnthropicProviderConfig;

  /** Default Google Gemini provider configuration. */
  gemini?: GeminiProviderConfig;

  /** Default Mistral provider configuration. */
  mistral?: MistralProviderConfig;
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
  const version = config.version ?? BUILTIN_PLUGIN_VERSION;

  registry.registerModelProvider({
    id: "openai",
    kind: "provider",
    source: "builtin",
    version,
    description: "Built-in OpenAI model provider extension.",
    create(overrides): ModelProvider {
      return new OpenAIProvider({
        ...config.openai,
        ...asRecord(overrides),
      });
    },
  });

  registry.registerModelProvider({
    id: "ollama",
    kind: "provider",
    source: "builtin",
    version,
    description: "Built-in Ollama model provider extension.",
    create(overrides) {
      return new OllamaProvider({
        ...config.ollama,
        ...asRecord(overrides),
      });
    },
  });

  registry.registerModelProvider({
    id: "anthropic",
    kind: "provider",
    source: "builtin",
    version,
    description: "Built-in Anthropic model provider extension.",
    create(overrides): ModelProvider {
      return new AnthropicProvider({
        ...config.anthropic,
        ...asRecord(overrides),
      });
    },
  });

  registry.registerModelProvider({
    id: "gemini",
    kind: "provider",
    source: "builtin",
    version,
    description: "Built-in Google Gemini model provider extension.",
    create(overrides): ModelProvider {
      return new GeminiProvider({
        ...config.gemini,
        ...asRecord(overrides),
      });
    },
  });

  registry.registerModelProvider({
    id: "mistral",
    kind: "provider",
    source: "builtin",
    version,
    description: "Built-in Mistral AI model provider extension.",
    create(overrides): ModelProvider {
      return new MistralProvider({
        ...config.mistral,
        ...asRecord(overrides),
      });
    },
  });
}

/**
 * Configuration for registering built-in logger extensions.
 *
 * @category Extensions
 */
export interface BuiltinLoggerConfig {
  /** Built-in extension version to report for registrations. */
  version?: ExtensionVersion;

  /** Configuration for the file logger (log dir, file name). */
  file?: FileLoggerConfig;
}

/**
 * Register built-in logger extensions in a registry.
 * Includes a file logger that writes to the user's ECP directory (~/.ecp/logs).
 */
export function registerBuiltinLoggers(
  registry: ExtensionRegistry,
  config: BuiltinLoggerConfig = {},
): void {
  const version = config.version ?? BUILTIN_PLUGIN_VERSION;

  registry.registerPlugin({
    id: "file",
    kind: "logger",
    source: "builtin",
    version,
    description: "Appends execution progress to a log file in the user ECP directory (~/.ecp/logs).",
    create(overrides): ProgressCallback {
      return createFileLogger({
        ...config.file,
        ...(overrides as FileLoggerConfig),
      });
    },
  });
}

/**
 * Register built-in plugin extensions (e.g. long-term memory store).
 */
export function registerBuiltinPlugins(
  registry: ExtensionRegistry,
  config: { version?: ExtensionVersion } = {},
): void {
  registerBuiltinMemoryPlugin(registry, config);
}

