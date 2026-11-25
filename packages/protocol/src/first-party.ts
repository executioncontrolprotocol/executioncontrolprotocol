/**
 * First-party plugin id to npm package, used for `ECP_PLUGINS_MISSING`.
 * @category Plugins
 */
export interface FirstPartyPlugin {
  /** npm package name. */
  readonly packageName: string
  /** Short name passed to `ecp plugins install`. */
  readonly short: string
  /** When true, the host bundles the plugin and install is not suggested. */
  readonly bundled?: boolean
}

/**
 * Static map of first-party plugin ids. A `uses` whose plugin id is here but
 * not installed is `ECP_PLUGINS_MISSING`; anything else is `ECP_CAPABILITY_UNKNOWN`.
 * @category Plugins
 */
export const FIRST_PARTY_PLUGINS: Readonly<Record<string, FirstPartyPlugin>> = {
  "@executioncontrolprotocol/test": {
    packageName: "@executioncontrolprotocol/test",
    short: "test",
  },
  "@executioncontrolprotocol/anthropic": {
    packageName: "@executioncontrolprotocol/anthropic",
    short: "anthropic",
  },
  "@executioncontrolprotocol/azure-blob-storage": {
    packageName: "@executioncontrolprotocol/azure-blob-storage",
    short: "azure-blob-storage",
  },
  "@executioncontrolprotocol/adobe-firefly-services": {
    packageName: "@executioncontrolprotocol/adobe-firefly-services",
    short: "adobe-firefly-services",
  },
  "@executioncontrolprotocol/core": {
    packageName: "@executioncontrolprotocol/core",
    short: "core",
    bundled: true,
  },
  "@executioncontrolprotocol/jsonata": {
    packageName: "@executioncontrolprotocol/jsonata",
    short: "jsonata",
  },
}

/**
 * Plugin id of a capability id (`@scope/name.capability` → `@scope/name`), or
 * `undefined` when the id is not shaped like a capability id.
 * @category Plugins
 */
export function pluginIdFromCapability(capabilityId: string): string | undefined {
  const dot = capabilityId.lastIndexOf(".")
  const slash = capabilityId.indexOf("/")
  if (!capabilityId.startsWith("@") || slash < 0 || dot <= slash) return undefined
  return capabilityId.slice(0, dot)
}

/**
 * First-party package for a plugin id, if the id is in {@link FIRST_PARTY_PLUGINS}.
 * @category Plugins
 */
export function firstPartyPlugin(pluginId: string): FirstPartyPlugin | undefined {
  return FIRST_PARTY_PLUGINS[pluginId]
}

/**
 * `ecp plugins install <short>` for a known first-party plugin id.
 * @category Plugins
 */
export function firstPartyInstallCommand(pluginId: string): string | undefined {
  const entry = FIRST_PARTY_PLUGINS[pluginId]
  if (entry === undefined || entry.bundled) return undefined
  return `ecp plugins install ${entry.short}`
}
