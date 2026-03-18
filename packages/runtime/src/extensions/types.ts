/**
 * Shared extensibility interfaces for ECP runtime registration.
 *
 * @category Extensions
 */

import type { ExtensionSourceType } from "@executioncontrolprotocol/spec";
import type { ModelProvider } from "../providers/model-provider.js";
import type { ProgressCallback } from "../engine/types.js";

/**
 * Base metadata for all runtime extension registrations.
 *
 * @category Extensions
 */
export interface ExtensionRegistrationBase {
  /** Stable extension ID (for example `"openai"`). */
  id: string;

  /** Extension version string. */
  version: string;

  /** Source type used to load this extension. */
  sourceType: ExtensionSourceType;

  /** Optional human-readable summary. */
  description?: string;
}

/**
 * Factory contract for model provider extensions.
 *
 * @category Extensions
 */
export interface ModelProviderRegistration extends ExtensionRegistrationBase {
  /** Fixed kind discriminator for model provider extensions. */
  kind: "model-provider";

  /**
   * Create a model provider instance from extension configuration.
   */
  create(config?: Record<string, unknown>): ModelProvider;
}

/**
 * Factory contract for executor extensions.
 *
 * @category Extensions
 */
export interface ExecutorRegistration extends ExtensionRegistrationBase {
  /** Fixed kind discriminator for executor extensions. */
  kind: "executor";

  /**
   * Create an executor extension instance from extension configuration.
   */
  create(config?: Record<string, unknown>): unknown;
}

/**
 * Factory contract for plugin extensions.
 *
 * @category Extensions
 */
export interface PluginRegistration extends ExtensionRegistrationBase {
  /** Fixed kind discriminator for plugin extensions. */
  kind: "plugin";

  /**
   * Create a plugin extension instance from extension configuration.
   */
  create(config?: Record<string, unknown>): unknown;
}

/**
 * Factory contract for progress logger extensions.
 * Progress loggers receive execution progress events (phase, steps, reasoning).
 *
 * @category Extensions
 */
export interface ProgressLoggerRegistration extends ExtensionRegistrationBase {
  /** Fixed kind discriminator for progress logger extensions. */
  kind: "progress-logger";

  /**
   * Create a progress logger callback from extension configuration.
   * The callback will be invoked for each progress event during a run.
   */
  create(config?: Record<string, unknown>): ProgressCallback;
}

