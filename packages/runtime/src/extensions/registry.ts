/**
 * Runtime extension registry for model providers, executors, and plugins.
 *
 * @category Extensions
 */

import type {
  ExecutorRegistration,
  ModelProviderRegistration,
  PluginRegistration,
  ProgressLoggerRegistration,
} from "./types.js";
import type { ModelProvider } from "../providers/model-provider.js";

/**
 * In-memory registry of runtime extension factories.
 *
 * @category Extensions
 */
export class ExtensionRegistry {
  private readonly modelProviders = new Map<string, ModelProviderRegistration>();
  private readonly executors = new Map<string, ExecutorRegistration>();
  private readonly plugins = new Map<string, PluginRegistration>();
  private readonly progressLoggers = new Map<string, ProgressLoggerRegistration>();
  private locked = false;

  /**
   * Prevent further registration changes.
   */
  lock(): void {
    this.locked = true;
  }

  /**
   * Register a model provider extension.
   */
  registerModelProvider(registration: ModelProviderRegistration): void {
    this.assertUnlocked();
    this.assertNotRegistered(registration.id, "model-provider");
    this.modelProviders.set(registration.id, registration);
  }

  /**
   * Register an executor extension.
   */
  registerExecutor(registration: ExecutorRegistration): void {
    this.assertUnlocked();
    this.assertNotRegistered(registration.id, "executor");
    this.executors.set(registration.id, registration);
  }

  /**
   * Register a progress logger extension.
   */
  registerProgressLogger(registration: ProgressLoggerRegistration): void {
    this.assertUnlocked();
    this.assertNotRegistered(registration.id, "progress-logger");
    this.progressLoggers.set(registration.id, registration);
  }

  /**
   * Register a plugin extension.
   */
  registerPlugin(registration: PluginRegistration): void {
    this.assertUnlocked();
    this.assertNotRegistered(registration.id, "plugin");
    this.plugins.set(registration.id, registration);
  }

  /**
   * Resolve and instantiate a model provider by ID.
   */
  createModelProvider(
    id: string,
    config?: Record<string, unknown>,
  ): ModelProvider {
    const registration = this.modelProviders.get(id);
    if (!registration) {
      throw new Error(`Model provider extension "${id}" is not registered.`);
    }
    return registration.create(config);
  }

  /**
   * Get a model provider registration by ID.
   */
  getModelProviderRegistration(id: string): ModelProviderRegistration | undefined {
    return this.modelProviders.get(id);
  }

  /**
   * List registered model provider extensions.
   */
  listModelProviders(): ModelProviderRegistration[] {
    return [...this.modelProviders.values()];
  }

  /**
   * List registered executor extensions.
   */
  listExecutors(): ExecutorRegistration[] {
    return [...this.executors.values()];
  }

  /**
   * List registered plugin extensions.
   */
  listPlugins(): PluginRegistration[] {
    return [...this.plugins.values()];
  }

  /**
   * Create a progress logger by ID.
   */
  createProgressLogger(
    id: string,
    config?: Record<string, unknown>,
  ): ReturnType<ProgressLoggerRegistration["create"]> {
    const registration = this.progressLoggers.get(id);
    if (!registration) {
      throw new Error(`Progress logger extension "${id}" is not registered.`);
    }
    return registration.create(config);
  }

  /**
   * Get a progress logger registration by ID.
   */
  getProgressLoggerRegistration(id: string): ProgressLoggerRegistration | undefined {
    return this.progressLoggers.get(id);
  }

  /**
   * List registered progress logger extensions.
   */
  listProgressLoggers(): ProgressLoggerRegistration[] {
    return [...this.progressLoggers.values()];
  }

  private assertUnlocked(): void {
    if (this.locked) {
      throw new Error("Extension registry is locked and cannot be modified.");
    }
  }

  private assertNotRegistered(
    id: string,
    kind: "model-provider" | "executor" | "plugin" | "progress-logger",
  ): void {
    const exists =
      this.modelProviders.has(id) ||
      this.executors.has(id) ||
      this.plugins.has(id) ||
      this.progressLoggers.has(id);
    if (exists) {
      throw new Error(`Extension "${id}" is already registered; duplicate ${kind} registration denied.`);
    }
  }
}

