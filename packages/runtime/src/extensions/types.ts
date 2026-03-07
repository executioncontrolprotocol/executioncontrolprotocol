/**
 * Shared extensibility interfaces for ECP runtime registration.
 *
 * @category Extensions
 */

import type { ExtensionSourceType } from "@ecp/spec";
import type { ModelProvider } from "../providers/model-provider.js";

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

