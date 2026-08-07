import {
  environment as coreEnvironment,
  extension,
  harness,
  runtime,
  policy,
  browser,
  Registry,
  globalRegistry,
} from "@executioncontrolprotocol/core"
import type { Environment } from "@executioncontrolprotocol/core"
import { registerStandardPolicies } from "@executioncontrolprotocol/policies"
import { BROWSER_RUNTIME_ID, registerBrowserRuntime } from "./runtime/builtin-browser.js"
import { registerBrowserRegistryExtension } from "./extensions/browser-registry.js"
import { registerBrowserSessionConfigExtension } from "./extensions/browser-session-config.js"
import { registerBrowserLocalConfigExtension } from "./extensions/browser-local-config.js"
import { registerBrowserGuideExtension } from "./extensions/browser-guide.js"
import { registerFormatEqlExtension } from "@executioncontrolprotocol/format-eql"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"
import { registerFormatMermaidExtension } from "@executioncontrolprotocol/format-mermaid"
import { registerChromeAiExtension } from "@executioncontrolprotocol/chrome-ai"
import { registerOpenaiExtension } from "@executioncontrolprotocol/extension-openai"
import { registerClaudeExtension } from "@executioncontrolprotocol/claude"
import { registerBrowserSecretsExtension } from "@executioncontrolprotocol/browser-secrets"
import { registerFalExtension } from "@executioncontrolprotocol/extension-fal"
import { registerImageSharpExtension } from "@executioncontrolprotocol/extension-image-sharp"
import {
  BROWSER_NANO_HARNESS_ID,
  HARNESS_NANO_BINDING,
  registerBrowserNanoHarnesses,
} from "@executioncontrolprotocol/harnesses-browser-nano"
import "@executioncontrolprotocol/format-eql"
import "@executioncontrolprotocol/format-toon"
import "@executioncontrolprotocol/format-mermaid"
import "@executioncontrolprotocol/chrome-ai"
import "@executioncontrolprotocol/extension-openai"
import "@executioncontrolprotocol/claude"
import "@executioncontrolprotocol/browser-secrets"
import "@executioncontrolprotocol/extension-fal"
import "@executioncontrolprotocol/extension-image-sharp"

/** Register browser runtime and standard browser extensions. */
export async function registerBrowserDefaults(registry: Registry = globalRegistry): Promise<void> {
  await registerBrowserRuntime(registry)
  await registerBrowserRegistryExtension(registry)
  await registerBrowserSessionConfigExtension(registry)
  await registerBrowserLocalConfigExtension(registry)
  await registerBrowserGuideExtension(registry)
  await registerFormatEqlExtension(registry)
  await registerFormatToonExtension(registry)
  await registerFormatMermaidExtension(registry)
  await registerChromeAiExtension(registry)
  await registerOpenaiExtension(registry)
  await registerClaudeExtension(registry)
  await registerBrowserSecretsExtension(registry)
  await registerFalExtension(registry)
  await registerImageSharpExtension(registry)
  await registerStandardPolicies(registry)
  registerBrowserNanoHarnesses()
}

/**
 * Browser demo environment with registry-control and browser-registry defaults.
 * @category Environment
 */
export function createBrowserDemoEnvironment(
  id: string,
  label?: string,
  registry: Registry = globalRegistry
): Environment {
  return coreEnvironment(id, label, registry)
    .withRuntime(runtime(BROWSER_RUNTIME_ID, "Browser Runtime"))
    .withExtensions([
      extension("@executioncontrolprotocol/format-eql").with({}),
      extension("@executioncontrolprotocol/format-toon").with({}),
      extension("@executioncontrolprotocol/format-mermaid").with({}),
      extension("@executioncontrolprotocol/format-json").with({}),
      extension("@executioncontrolprotocol/chrome-ai").with({}),
      extension("@executioncontrolprotocol/browser-secrets").with({}),
      extension("@executioncontrolprotocol/openai").with({
        apiKey: browser("OPENAI_API_KEY", { optional: true }),
      }),
      extension("@executioncontrolprotocol/claude").with({
        apiKey: browser("ANTHROPIC_API_KEY", { optional: true }),
      }),
      extension("@executioncontrolprotocol/fal").with({
        apiKey: browser("FAL_KEY", { optional: true }),
        defaultMode: "subscribe",
      }),
      extension("@executioncontrolprotocol/image-sharp").with({}),
      extension("@executioncontrolprotocol/browser-registry").with({
        freezeOn: "environment:beforeRun",
        autoBindRegisteredExtensions: true,
        exposeGlobal: true,
        globalName: "ecp",
      }),
      extension("@executioncontrolprotocol/browser-session-config").with({ persist: false }),
      extension("@executioncontrolprotocol/browser-local-config").with({}),
      extension("@executioncontrolprotocol/browser").with({}),
    ])
    .withHarnesses([
      harness(BROWSER_NANO_HARNESS_ID, "Harness")
        .uses("@executioncontrolprotocol/chrome-ai.generate")
        .with({ ...HARNESS_NANO_BINDING }),
    ])
    .withPolicies([
      policy("@executioncontrolprotocol/registry-control").with({
        allowedExtensionNamespaces: [
          "@executioncontrolprotocol/chrome-ai",
          "@executioncontrolprotocol/openai",
          "@executioncontrolprotocol/claude",
          "@executioncontrolprotocol/fal",
          "@executioncontrolprotocol/image-sharp",
          "@executioncontrolprotocol/browser",
          "@customer/*",
        ],
        deniedExtensionNamespaces: [],
        allowDynamicExtensionRegistration: true,
        allowAutoBind: true,
      }),
    ])
}

/**
 * Create a browser environment with `@executioncontrolprotocol/browser` runtime pre-bound.
 * @category Environment
 */
export async function environment(id: string, label?: string): Promise<Environment> {
  await registerBrowserDefaults()
  return createBrowserDemoEnvironment(id, label)
}
