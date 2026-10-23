import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { Hook } from "@oclif/core"
import {
  extension,
  policy,
  type ExtensionDefinition,
  type PolicyDefinition,
} from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { setHost } from "@executioncontrolprotocol/plugin-sdk"
import { listInstalledPlugins } from "../lib/installed-plugins.js"

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
 * Create the process-wide ECP host from installed plugin definitions.
 * @category CLI
 */
const hook: Hook<"init"> = async function (options) {
  const argv = options.argv ?? process.argv
  if (
    !options.id ||
    options.id === "help" ||
    options.id === "version" ||
    argv.includes("--help") ||
    argv.includes("-h")
  ) {
    return
  }
  const bindings = []
  for (const plugin of listInstalledPlugins(options.config)) {
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
  const env = environment(NODE_ENVIRONMENT_ID, "cli").with(bindings)
  const ecp = await env.init()
  setHost({
    ecp,
    registry: ecp.getRegistry(),
    environmentId: NODE_ENVIRONMENT_ID,
    output: "pretty",
  })
}

export default hook
