import type {
  CapabilityCall,
  CapabilityEntry,
  HandlerStore,
  JsonSchema,
  PluginAdapter,
  PluginInfo,
  PluginManifest,
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
 * Plugin adapter that serves one manifest and in-test handlers. It does not import plugin code.
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
   * @param manifest A fixture `ecp.manifest.json`, already parsed.
   * @param handlers Capability id to handler. A missing handler fails the call.
   */
  constructor(
    private readonly manifest: PluginManifest,
    private readonly handlers: Record<string, FixtureHandler>,
  ) {}

  /** Capability entries from the manifest. */
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
      accepts: capability.accepts,
      returns: capability.returns,
      configSchema: this.manifest.configSchema,
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

  /** Config schema when the id matches this manifest. */
  configSchema(pluginId: string): JsonSchema | undefined {
    if (pluginId !== this.manifest.plugin.id) return undefined
    return this.manifest.configSchema
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
