/**
 * Built-in extension registrations for core runtime providers.
 *
 * @category Extensions
 */

import type { ExtensionVersion } from "@executioncontrolprotocol/spec";
import { OpenAIProvider } from "../providers/openai/openai-provider.js";
import type { OpenAIProviderConfig } from "../providers/openai/openai-provider.js";
import { OllamaProvider } from "../providers/ollama/ollama-provider.js";
import type { OllamaProviderConfig } from "../providers/ollama/ollama-provider.js";
import { createFileProgressLogger } from "./progress-loggers/file-logger.js";
import type { FileProgressLoggerConfig } from "./progress-loggers/file-logger.js";
import { registerBuiltinMemoryPlugin } from "../plugins/memory/index.js";
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

/**
 * Configuration for registering built-in progress loggers.
 *
 * @category Extensions
 */
export interface BuiltinProgressLoggerConfig {
  /** Built-in extension version to report for registrations. */
  version?: ExtensionVersion;

  /** Configuration for the file progress logger (log dir, file name). */
  file?: FileProgressLoggerConfig;
}

/**
 * Register built-in progress loggers in a registry.
 * Includes a file logger that writes to the user's ECP directory (~/.ecp/logs).
 */
export function registerBuiltinProgressLoggers(
  registry: ExtensionRegistry,
  config: BuiltinProgressLoggerConfig = {},
): void {
  const version = config.version ?? "0.3.0";

  registry.registerProgressLogger({
    id: "file",
    kind: "progress-logger",
    sourceType: "builtin",
    version,
    description: "Appends execution progress to a log file in the user ECP directory (~/.ecp/logs).",
    create(overrides) {
      return createFileProgressLogger({
        ...config.file,
        ...(overrides as FileProgressLoggerConfig),
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

