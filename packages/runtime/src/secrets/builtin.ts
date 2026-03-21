/**
 * Register built-in secret providers and construct a broker.
 *
 * @category Secrets
 */

import { resolve } from "node:path";

import type { SecretPolicyMode } from "@executioncontrolprotocol/plugins";
import { DefaultSecretBroker } from "./broker.js";
import { DefaultSecretProviderRegistry } from "./registry.js";
import { CliSessionSecretProvider } from "./providers/cli-session-secret-provider.js";
import { DotenvSecretProvider } from "./providers/dotenv-secret-provider.js";
import { EnvSecretProvider } from "./providers/env-secret-provider.js";
import { OsKeychainSecretProvider } from "./providers/os-keychain-secret-provider.js";

export interface BuiltinSecretRegistrationOptions {
  /** Absolute or cwd-relative path to `.env` for the `dotenv` provider. */
  dotenvPath?: string;
  /** Current working directory for default `.env` resolution. */
  cwd?: string;
}

/**
 * Register all built-in secret providers on the given registry.
 */
export function registerBuiltinSecretProviders(
  registry: DefaultSecretProviderRegistry,
  options: BuiltinSecretRegistrationOptions = {},
): void {
  registry.register(new OsKeychainSecretProvider());
  registry.register(new EnvSecretProvider());
  const cwd = options.cwd ?? process.cwd();
  const dotenvPath = options.dotenvPath ?? resolve(cwd, ".env");
  registry.register(new DotenvSecretProvider(dotenvPath));
  registry.register(new CliSessionSecretProvider());
}

export interface CreateDefaultSecretBrokerOptions extends BuiltinSecretRegistrationOptions {
  policy?: SecretPolicyMode;
}

/**
 * Create a fresh registry with built-in providers and a broker using the given policy.
 */
export function createDefaultSecretBroker(
  options: CreateDefaultSecretBrokerOptions = {},
): { registry: DefaultSecretProviderRegistry; broker: DefaultSecretBroker } {
  const registry = new DefaultSecretProviderRegistry();
  registerBuiltinSecretProviders(registry, {
    dotenvPath: options.dotenvPath,
    cwd: options.cwd,
  });
  const broker = new DefaultSecretBroker(registry, options.policy ?? "warn");
  return { registry, broker };
}
