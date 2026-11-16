import type {
  CapabilityCall,
  CapabilityEntry,
  HandlerStore,
  JsonSchema,
  PluginAdapter,
  PluginInfo,
  PluginManifest,
  PluginSchemaDocument,
  PluginSchemaFingerprint,
} from "@executioncontrolprotocol/protocol"

/**
 * Handler for one fixture capability. The host passes the resolved input.
 * @category Environment
 */
export type FixtureHandler = (
  input: unknown,
  ctx: { signal: AbortSignal; config: Record<string, unknown> | undefined; store?: HandlerStore },
) => Promise<unknown>

/**
 * Plugin adapter that serves one light manifest, schema document, and in-test handlers.
 * It does not import plugin code.
 * @category Environment
 */
export class FixturePluginAdapter implements PluginAdapter {
  /** Implementation id. */
  static readonly id = "@executioncontrolprotocol/testing.plugins"

  /**
   * Staged writes for the in-flight capability call. The operations bridge sets this.
   * @category Environment
   */
  currentStore?: HandlerStore

  /**
   * @param manifest A light fixture `ecp.manifest.json`, already parsed.
   * @param handlers Capability id to handler. A missing handler fails the call.
   * @param schemaDocument Matching `ecp.schema.json` used to assemble accepts/returns.
   */
  constructor(
    private readonly manifest: PluginManifest,
    private readonly handlers: Record<string, FixtureHandler>,
    private readonly schemaDocument: PluginSchemaDocument,
  ) {}

  /**
   * Light capability rows (no accepts/returns). Tests that need schemas should call
   * {@link FixturePluginAdapter.loadPluginSchema} or assemble full entries.
   */
  capabilities(): CapabilityEntry[] {
    return this.manifest.capabilities.map((capability) => ({
      id: capability.id,
      plugin: this.manifest.plugin.id,
      package: this.manifest.plugin.package,
      pluginVersion: this.manifest.plugin.version,
      summary: capability.summary,
      description: capability.description,
      useCases: capability.useCases,
      projections: capability.projections,
      timeoutMs: capability.timeoutMs,
    }))
  }

  /** The single fixture plugin. */
  plugins(): PluginInfo[] {
    return [
      {
        package: this.manifest.plugin.package,
        id: this.manifest.plugin.id,
        version: this.manifest.plugin.version,
        source: "core",
        capabilities: this.manifest.capabilities.map((capability) => capability.id),
        loaded: true,
        manifestOk: true,
      },
    ]
  }

  /** Schema fingerprints from the light manifest. */
  schemaFingerprints(): readonly PluginSchemaFingerprint[] {
    return [
      {
        pluginId: this.manifest.plugin.id,
        version: this.manifest.plugin.version,
        hash: this.manifest.pluginSchema.hash,
      },
    ]
  }

  /** Config schema when the id matches this manifest. */
  configSchema(pluginId: string): JsonSchema | undefined {
    if (pluginId !== this.manifest.plugin.id) return undefined
    return this.schemaDocument.$defs.config
  }

  /** Return the fixture schema document when the id matches. */
  async loadPluginSchema(pluginId: string): Promise<PluginSchemaDocument | undefined> {
    if (pluginId !== this.manifest.plugin.id && pluginId !== this.manifest.plugin.package) {
      return undefined
    }
    return this.schemaDocument
  }

  /** Invoke the in-test handler. */
  async call(request: CapabilityCall, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) throw new Error("ECP_RUN_CANCELLED")
    const handler = this.handlers[request.capabilityId]
    if (!handler) {
      throw new Error(`ECP_PLUGIN_LOAD_FAILED: no handler for ${request.capabilityId}`)
    }
    return handler(request.input, {
      signal,
      config: request.config,
      store: request.store ?? this.currentStore,
    })
  }
}
