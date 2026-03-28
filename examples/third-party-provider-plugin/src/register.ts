/**
 * ECP plugin entry point: exports a `register` function that the
 * dynamic plugin loader calls with an {@link ExtensionRegistry}.
 *
 * This file is the ESM module referenced by `ecp.entry.module` in
 * `package.json`. The runtime resolves it, dynamic-imports it, and
 * invokes the `register` export.
 */

import type { ModelProviderRegistration } from "@executioncontrolprotocol/plugins";
import { MockProvider } from "./mock-provider.js";
import type { MockProviderConfig } from "./mock-provider.js";

/**
 * The registry interface expected by the loader. We declare only
 * what we call so this example compiles with zero runtime imports.
 */
interface ExtensionRegistry {
  registerModelProvider(registration: ModelProviderRegistration): void;
}

/**
 * Register the mock model provider as a third-party plugin.
 *
 * The ECP dynamic loader calls this function when the plugin is
 * installed via `ecp config plugins add` and the host starts.
 */
export function register(registry: ExtensionRegistry): void {
  registry.registerModelProvider({
    id: "example-provider",
    kind: "provider",
    source: "local",
    version: "1.0.0",
    description: "Mock model provider (third-party plugin example).",
    create(config?: Record<string, unknown>) {
      return new MockProvider(config as MockProviderConfig | undefined);
    },
  });
}
