import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { Interfaces } from "@oclif/core"
import {
  extension,
  policy,
  type EnvironmentBinding,
  type ExtensionDefinition,
  type PolicyDefinition,
} from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { listInstalledPlugins } from "./installed-plugins.js"

function isPolicy(def: unknown): def is PolicyDefinition {
  return (
    typeof def === "object" &&
    def !== null &&
    "hooks" in def &&
    !("capabilities" in def)
  )
}

function isExtension(def: unknown): def is ExtensionDefinition {
  return typeof def === "object" && def !== null && "capabilities" in def
}

/**
 * Bindings from installed oclif plugins that declare `ecp.extension`.
 * @category CLI
 */
export async function bindingsFromInstalledPlugins(
  config: Interfaces.Config
): Promise<EnvironmentBinding[]> {
  const bindings: EnvironmentBinding[] = []
  for (const plugin of listInstalledPlugins(config)) {
    const ecp = plugin.pjson.ecp as { extension?: string } | undefined
    const entry = ecp?.extension
    if (!entry) continue
    try {
      const href = pathToFileURL(join(plugin.root, entry)).href
      const mod = (await import(href)) as { default?: unknown }
      const def = mod.default
      if (isExtension(def)) bindings.push(extension(def))
      else if (isPolicy(def)) bindings.push(policy(def))
    } catch {
      /* skip plugins whose definition cannot load */
    }
  }
  return bindings
}

/**
 * Built-in Node environment plus installed plugin bindings.
 * @category CLI
 */
export async function createProcessEnvironment(config: Interfaces.Config) {
  const bindings = await bindingsFromInstalledPlugins(config)
  return environment(NODE_ENVIRONMENT_ID, "cli").with(bindings)
}
