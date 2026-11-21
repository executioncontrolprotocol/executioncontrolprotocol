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
  PluginSchemaDocument,
  PluginSchemaFingerprint,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import {
  ArtifactStore,
  IMPLEMENTATION_IDS,
  ScratchSpace,
} from "@executioncontrolprotocol/protocol"
import { discoverPluginRoots } from "./discover.js"
import { createFileService } from "./files.js"
import { loadPluginPackage, loadPluginSchemaDocument, type LoadedPluginPackage } from "./load-manifest.js"
import { validateCapabilityInput } from "./validate-input.js"

interface RegisteredPlugin {
  info: PluginInfo
  loaded?: LoadedPluginPackage
  definition?: PluginDefinition
  handlers: Map<string, (input: unknown, ctx: unknown) => Promise<unknown>>
}

const BUNDLED_CORE_PLUGIN_ID = "@executioncontrolprotocol/core"

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
      if (
        loaded.manifest.plugin.id === BUNDLED_CORE_PLUGIN_ID &&
        this.registrations.some((item) => item.info.id === BUNDLED_CORE_PLUGIN_ID && item.info.manifestOk)
      ) {
        this.registrations.push({
          info: {
            package: loaded.packageName,
            id: loaded.manifest.plugin.id,
            version: loaded.packageVersion,
            source: root.source,
            capabilities: [],
            loaded: false,
            manifestOk: false,
            issues: [
              {
                code: "ECP_PLUGIN_LOAD_FAILED",
                severity: "error",
                message: `Plugin ${BUNDLED_CORE_PLUGIN_ID} is bundled with the host; a duplicate install was ignored.`,
                path: "",
              },
            ],
          },
          handlers: new Map(),
        })
        continue
      }
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

  /** Light capability rows from manifests (no accepts/returns embeds). */
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
          timeoutMs: capability.timeoutMs,
          ...(capability.contract === undefined ? {} : { contract: capability.contract }),
          ...(capability.code === undefined ? {} : { code: capability.code }),
          ...(capability.role === undefined ? {} : { role: capability.role }),
          ...(capability.publish === undefined ? {} : { publish: capability.publish }),
        })
      }
    }
    return entries
  }

  /** Installed plugins, including failed ones. */
  plugins(): PluginInfo[] {
    return this.registrations.map((registration) => ({ ...registration.info }))
  }

  /** Light-manifest schema fingerprints (does not read `ecp.schema.json`). */
  schemaFingerprints(): readonly PluginSchemaFingerprint[] {
    const out: PluginSchemaFingerprint[] = []
    for (const registration of this.registrations) {
      if (!registration.info.manifestOk || !registration.loaded) continue
      out.push({
        pluginId: registration.info.id,
        version: registration.info.version,
        hash: registration.loaded.manifest.pluginSchema.hash,
      })
    }
    return out
  }

  /** Config schema for a plugin id (loads the schema document on first use). */
  configSchema(pluginId: string): JsonSchema | undefined {
    const registration = this.findRegistration(pluginId)
    return registration?.loaded?.schemaDocument?.$defs.config
  }

  /**
   * Load the plugin schema document on first use. Missing or invalid documents mark the
   * plugin `manifestOk: false`.
   */
  async loadPluginSchema(pluginId: string): Promise<PluginSchemaDocument | undefined> {
    const registration = this.findRegistration(pluginId)
    if (!registration?.loaded) return undefined
    if (!registration.info.manifestOk && !registration.loaded.schemaDocument) return undefined
    if (registration.loaded.schemaDocument) return registration.loaded.schemaDocument
    if (!registration.info.manifestOk) return undefined
    const result = await loadPluginSchemaDocument(registration.loaded)
    if (!result.ok) {
      registration.info.manifestOk = false
      registration.info.issues = result.issues
      return undefined
    }
    return result.document
  }

  /** Import on first call and invoke the handler with a full context. */
  async call(request: CapabilityCall, signal: AbortSignal): Promise<unknown> {
    const indexed = this.capabilityIndex.get(request.capabilityId)
    if (!indexed) {
      throw Object.assign(new Error(`Capability ${request.capabilityId} is not registered.`), {
        code: "ECP_CAPABILITY_UNKNOWN",
      })
    }
    const schemaDocument = await this.loadPluginSchema(indexed.plugin.info.id)
    const accepts = schemaDocument?.$defs[`${indexed.name}.accepts`]
    if (accepts) validateCapabilityInput(accepts, request.input)
    const handler = await this.resolveHandler(indexed.plugin, indexed.name)
    const store: HandlerStore = request.store ?? {
      set() {},
      merge() {},
      append() {},
    }
    const usage = request.usage ?? { record() {} }
    const runId = request.context.runId
    const stepId = request.context.stepId
    const artifacts = this.ctx.services.get(ArtifactStore)
    const scratch = this.ctx.services.get(ScratchSpace)
    const fileNotes = request.fileNotes ?? { mediaTypes: [] }
    const fileService = createFileService({
      runId,
      stepId,
      artifacts,
      scratch,
      maxBytes: this.ctx.settings.files,
      mediaTypeNotes: fileNotes.mediaTypes,
      ...(request.executionDir ? { executionDir: request.executionDir } : {}),
    })
    const ctx = createHandlerContext({
      config: request.config,
      signal,
      init: request.context,
      store,
      deps: {
        files: fileService.files,
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
              fileNotes,
              ...(request.executionDir ? { executionDir: request.executionDir } : {}),
            },
            signal,
          )
        },
        logger: {
          debug: (message, detail) =>
            this.ctx.logger.debug(`[${runId}/${stepId}] ${message}`, detail),
          info: (message, detail) =>
            this.ctx.logger.info(`[${runId}/${stepId}] ${message}`, detail),
          warn: (message, detail) =>
            this.ctx.logger.warn(`[${runId}/${stepId}] ${message}`, detail),
          error: (message, detail) =>
            this.ctx.logger.error(`[${runId}/${stepId}] ${message}`, detail),
        },
        usage,
      },
    })
    try {
      return await handler(request.input, ctx)
    } finally {
      await fileService.releaseStep()
    }
  }

  private findRegistration(pluginId: string): RegisteredPlugin | undefined {
    return this.registrations.find(
      (item) => item.info.id === pluginId || item.info.package === pluginId,
    )
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
