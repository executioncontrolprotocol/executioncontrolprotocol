import { pathToFileURL } from "node:url"
import {
  createHandlerContext,
  type ServiceContext,
} from "@executioncontrolprotocol/engine"
import type { PluginDefinition } from "@executioncontrolprotocol/plugin-sdk"
import type {
  CapabilityCall,
  CapabilityEntry,
  HandlerStore,
  JsonSchema,
  PluginAdapter,
  PluginInfo,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import { IMPLEMENTATION_IDS, StorageProvider } from "@executioncontrolprotocol/protocol"
import { discoverPluginRoots } from "./discover.js"
import { createPluginFiles } from "./files.js"
import { loadPluginPackage, type LoadedPluginPackage } from "./load-manifest.js"
import { validateCapabilityInput } from "./validate-input.js"

interface RegisteredPlugin {
  info: PluginInfo
  loaded?: LoadedPluginPackage
  definition?: PluginDefinition
  handlers: Map<string, (input: unknown, ctx: unknown) => Promise<unknown>>
}

/**
 * Options for {@link LocalPluginRegistration}.
 * @category Plugins
 */
export interface LocalPluginRegistrationOptions {
  /** `$ECP_DATA_DIR` for oclif user/link plugins. */
  dataDir?: string
  /** Extra package roots (tests). Treated as `core`. */
  extraPlugins?: string[]
  /** Linked package roots (dev). Manifests are regenerated in memory. */
  linkedPlugins?: string[]
  /** Override artifact directory for a run. */
  artifactDirForRun?: (runId: string) => string
}

/**
 * Node {@link PluginAdapter}: registry from manifests, handlers imported on first call.
 * @category Plugins
 */
export class LocalPluginRegistration implements PluginAdapter {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.localPlugins

  private readonly registrations: RegisteredPlugin[] = []
  private readonly capabilityIndex = new Map<string, { plugin: RegisteredPlugin; name: string }>()
  private readonly options: LocalPluginRegistrationOptions
  private readonly ctx: ServiceContext
  private started = false

  /**
   * @param ctx Service context from the environment.
   */
  constructor(ctx: ServiceContext) {
    this.ctx = ctx
    this.options = (ctx.options as LocalPluginRegistrationOptions | undefined) ?? {}
  }

  /** Discover and validate plugins. Does not import handlers. */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    const roots = await discoverPluginRoots({
      dataDir: this.options.dataDir,
      extraPlugins: this.options.extraPlugins ?? this.ctx.settings.extraPlugins,
    })
    for (const linked of this.options.linkedPlugins ?? []) {
      roots.push({ root: linked, source: "link" })
    }
    const seenCapabilities = new Map<string, string>()

    for (const root of roots) {
      const result = await loadPluginPackage(root.root, root.source)
      if (!result.ok) {
        this.registrations.push({
          info: {
            package: result.packageName ?? root.root,
            id: result.packageName ?? root.root,
            version: "0.0.0",
            source: root.source,
            capabilities: [],
            loaded: false,
            manifestOk: false,
            issues: result.issues,
          },
          handlers: new Map(),
        })
        continue
      }

      const { loaded } = result
      const duplicateIssues: ValidationIssue[] = []
      for (const capability of loaded.manifest.capabilities) {
        const owner = seenCapabilities.get(capability.id)
        if (owner) {
          duplicateIssues.push({
            code: "ECP_PLUGIN_LOAD_FAILED",
            severity: "error",
            message: `Capability ${capability.id} is already registered by ${owner}.`,
            path: `/capabilities/${capability.name}`,
          })
        }
      }
      if (duplicateIssues.length > 0) {
        this.registrations.push({
          info: {
            package: loaded.packageName,
            id: loaded.manifest.plugin.id,
            version: loaded.packageVersion,
            source: root.source,
            capabilities: [],
            loaded: Boolean(loaded.definition),
            manifestOk: false,
            issues: duplicateIssues,
          },
          handlers: new Map(),
        })
        continue
      }

      const registered: RegisteredPlugin = {
        info: {
          package: loaded.packageName,
          id: loaded.manifest.plugin.id,
          version: loaded.packageVersion,
          source: root.source,
          capabilities: loaded.manifest.capabilities.map((capability) => capability.id),
          loaded: Boolean(loaded.definition),
          manifestOk: true,
        },
        loaded,
        definition: loaded.definition,
        handlers: new Map(),
      }
      this.registrations.push(registered)
      for (const capability of loaded.manifest.capabilities) {
        seenCapabilities.set(capability.id, loaded.manifest.plugin.id)
        this.capabilityIndex.set(capability.id, { plugin: registered, name: capability.name })
      }
    }
  }

  /** Capability entries from good manifests. */
  capabilities(): CapabilityEntry[] {
    const entries: CapabilityEntry[] = []
    for (const registration of this.registrations) {
      if (!registration.info.manifestOk || !registration.loaded) continue
      for (const capability of registration.loaded.manifest.capabilities) {
        entries.push({
          id: capability.id,
          plugin: registration.info.id,
          package: registration.info.package,
          pluginVersion: registration.info.version,
          summary: capability.summary,
          description: capability.description,
          useCases: capability.useCases,
          projections: capability.projections,
          accepts: capability.accepts,
          returns: capability.returns,
          configSchema: registration.loaded.manifest.configSchema,
          timeoutMs: capability.timeoutMs,
        })
      }
    }
    return entries
  }

  /** Installed plugins, including failed ones. */
  plugins(): PluginInfo[] {
    return this.registrations.map((registration) => ({ ...registration.info }))
  }

  /** Config schema for a plugin id. */
  configSchema(pluginId: string): JsonSchema | undefined {
    const registration = this.registrations.find(
      (item) => item.info.id === pluginId || item.info.package === pluginId,
    )
    return registration?.loaded?.manifest.configSchema
  }

  /** Import on first call and invoke the handler with a full context. */
  async call(request: CapabilityCall, signal: AbortSignal): Promise<unknown> {
    const indexed = this.capabilityIndex.get(request.capabilityId)
    if (!indexed) {
      throw Object.assign(new Error(`Capability ${request.capabilityId} is not registered.`), {
        code: "ECP_CAPABILITY_UNKNOWN",
      })
    }
    const entry = indexed.plugin.loaded?.manifest.capabilities.find(
      (capability) => capability.name === indexed.name,
    )
    if (entry) validateCapabilityInput(entry.accepts, request.input)
    const handler = await this.resolveHandler(indexed.plugin, indexed.name)
    const store: HandlerStore = request.store ?? {
      set() {},
      merge() {},
      append() {},
    }
    const usage = request.usage ?? { record() {} }
    const runId = request.context.runId
    const artifactDir =
      this.options.artifactDirForRun?.(runId) ??
      (this.ctx.services.has(StorageProvider)
        ? this.ctx.services.get(StorageProvider).runs.artifactDir(runId)
        : `/tmp/ecp/runs/${runId}/artifacts`)
    const files = createPluginFiles({ artifactDir, runId })
    const ctx = createHandlerContext({
      config: request.config,
      signal,
      init: request.context,
      store,
      deps: {
        readFile: (ref) => files.read(ref),
        writeArtifact: (bytes, options) => files.writeArtifact(bytes, options),
        call: async (capabilityId, input, options) => {
          if (options?.config) {
            throw Object.assign(
              new Error(
                `ECP_CONFIG_NOT_FOUND: nested call config object "${options.config}" is not resolved in Phase 2 local adapter.`,
              ),
              { code: "ECP_CONFIG_NOT_FOUND" },
            )
          }
          return this.call(
            {
              capabilityId,
              input,
              config: request.config,
              context: {
                ...request.context,
                stepId: `${request.context.stepId}>${capabilityId}`,
              },
              store,
              usage,
            },
            signal,
          )
        },
        logger: {
          debug: (message, detail) =>
            this.ctx.logger.debug(`[${runId}/${request.context.stepId}] ${message}`, detail),
          info: (message, detail) =>
            this.ctx.logger.info(`[${runId}/${request.context.stepId}] ${message}`, detail),
          warn: (message, detail) =>
            this.ctx.logger.warn(`[${runId}/${request.context.stepId}] ${message}`, detail),
          error: (message, detail) =>
            this.ctx.logger.error(`[${runId}/${request.context.stepId}] ${message}`, detail),
        },
        usage,
      },
    })
    return handler(request.input, ctx)
  }

  private async resolveHandler(
    plugin: RegisteredPlugin,
    name: string,
  ): Promise<(input: unknown, ctx: unknown) => Promise<unknown>> {
    const cached = plugin.handlers.get(name)
    if (cached) return cached
    try {
      if (!plugin.definition) {
        if (!plugin.loaded) throw new Error(`Plugin ${plugin.info.id} has no loaded package.`)
        const mod = (await import(pathToFileURL(plugin.loaded.entryPath).href)) as {
          default?: PluginDefinition
        }
        if (!mod.default) throw new Error(`Plugin ${plugin.info.id} has no default export.`)
        plugin.definition = mod.default
        plugin.info.loaded = true
      }
      const capability = plugin.definition.capabilities[name]
      if (!capability) throw new Error(`Capability ${name} is missing from ${plugin.info.id}.`)
      const imported = await capability.handler()
      const handler = imported.default as (input: unknown, ctx: unknown) => Promise<unknown>
      plugin.handlers.set(name, handler)
      return handler
    } catch (error) {
      throw Object.assign(
        new Error(
          error instanceof Error
            ? `ECP_PLUGIN_LOAD_FAILED: ${error.message}`
            : `ECP_PLUGIN_LOAD_FAILED: failed to load ${plugin.info.id}.${name}`,
        ),
        { code: "ECP_PLUGIN_LOAD_FAILED" },
      )
    }
  }
}
