import { LATEST_ECP_VERSION } from "../types/index.js"
import type {
  DescribeQuery,
  EnvironmentDescriptor,
  EnvironmentManifest,
  RegistryRegistrationRequest,
  RunResult,
  SearchOptions,
  SearchResult,
  StepRunRecord,
  ValidationResult,
  WorkflowManifest,
} from "../types/index.js"
import type { NamespacedId } from "../types/index.js"
import { extension, type ExtensionBindingBuilder } from "../bindings/extension.js"
import { policy, PolicyBindingBuilder } from "../bindings/policy.js"
import { Registry } from "../registry/registry.js"
import { ensureBoundExtensionsRegistered as ensureBoundExtensions } from "../registry/ensure-bound-extensions.js"
import { RegistryRegistrationDeniedError } from "../registry/errors.js"
import type { RuntimeExecutor } from "../runtime/executor.js"
import type { EnvironmentLifecycleHost, PolicyContext } from "../runtime/context.js"
import { createUsageLedger } from "../runtime/context.js"
import {
  createCapabilityArtifactStore,
  type CapabilityArtifactStore,
} from "../runtime/artifacts.js"
import {
  createCapabilityBlobStore,
  type CapabilityBlobStore,
} from "../runtime/blobs.js"
import type { RemoteInvokeBinding } from "../runtime/remote-invoke.js"
import { ServiceMap } from "../services/map.js"
import type { ServiceProvider, ServiceToken } from "../services/provider.js"
import { evaluatePolicies } from "../runtime/policy-engine.js"
import {
  manifestConfig,
  resolveBindingsForRun,
  type ResolvedBindings,
} from "./bindings.js"
import type { EnvironmentConfigResolver } from "./config-resolver.js"
import { buildDescriptor } from "./describe.js"
import { searchCapabilities } from "./search.js"
import { validateEnvironmentWithWorkflow } from "../validate/environment.js"
import { validateBoundConfig } from "./validate-binding-config.js"
import { registerCoreFormats } from "../formats/register-core-formats.js"
import type { EnvironmentDefinition, HookDefinition, PolicyDefinition } from "../definitions/types.js"
import { getEnvironmentDefinition } from "../definitions/environment.js"
import type { EncodingEnvironmentHost } from "./encoding-host.js"
import { EcpImpl, type Ecp } from "./ecp.js"
import { createInvokeBuilder } from "../invoke/invoke-builder.js"
import { validateWorkflowAcceptsInput } from "../schema/workflow-io.js"
import {
  registryControlPolicy,
  REGISTRY_CONTROL_POLICY_ID,
} from "../policies/registry-control.js"

function resolveId(ref: NamespacedId | { id: NamespacedId } | string): NamespacedId {
  if (typeof ref === "string") return ref as NamespacedId
  if ("id" in ref) return ref.id
  return ref as NamespacedId
}

function isPolicyDefinition(ref: unknown): ref is PolicyDefinition {
  return (
    typeof ref === "object" &&
    ref !== null &&
    "id" in ref &&
    "hooks" in ref &&
    !("capabilities" in ref)
  )
}

function isPolicyBinding(binding: EnvironmentBinding): binding is PolicyBindingBuilder {
  if ((binding as { kind?: string }).kind === "policy") return true
  if (binding instanceof PolicyBindingBuilder) return true
  return isPolicyDefinition(binding.getRef())
}

function emptyWorkflowStub(): WorkflowManifest {
  return {
    schema: "@executioncontrolprotocol.workflow",
    version: LATEST_ECP_VERSION,
    workflow: { id: "environment-stub" },
    steps: [],
  }
}

const REGISTRY_CHECK_STEP = {
  id: "registry-check",
  capabilityId: "registry.registerExtension",
} as const

/** Run options. @category Environment */
export interface RunOptions {
  input?: Record<string, unknown>
  dryRun?: boolean
  signal?: AbortSignal
  /** Run-scoped browser files for mixed upload locators. */
  blobs?: CapabilityBlobStore
  /** Inclusive stop after this leaf step (`ecp run --to`). */
  stopAfterStepId?: string
  /** Execute only this leaf step (`ecp runs rerun --from X --to X`). */
  onlyStepId?: string
  /** Seed committed state for resume/rerun. */
  seedState?: Record<string, unknown>
  /** Seed step history for resume/rerun. */
  seedHistory?: Record<string, StepRunRecord>
  /** Recorded approvals for a paused step. */
  approvals?: import("../types/index.js").RunApproval[]
  /** Host journal metadata. */
  journal?: import("../types/index.js").RunJournalMeta
  /** Public NDJSON callback (`ecp run --events`). May return a promise so hosts can flush. */
  onEvent?: (event: import("../types/index.js").PublicRunEvent) => void | Promise<void>
}

/**
 * Options for {@link Environment.init}.
 * @category Environment
 */
export interface EnvironmentInitOptions {
  /**
   * Override the default blob store.
   * @category Environment
   */
  blobStore?: CapabilityBlobStore
  /**
   * Override the default artifact store.
   * @category Environment
   */
  artifactStore?: CapabilityArtifactStore
  /**
   * Local invoke host for host/mixed capability hops.
   * @category Environment
   */
  remoteInvoke?: RemoteInvokeBinding
  /**
   * Use this registry instead of the per-instance default.
   * @category Environment
   */
  registry?: Registry
}

/** Binding accepted by {@link Environment.with}. @category Environment */
export type EnvironmentBinding = ExtensionBindingBuilder | PolicyBindingBuilder

/**
 * Configured ECP environment.
 * @category Environment
 */
export class Environment implements EnvironmentLifecycleHost, EncodingEnvironmentHost {
  private resolved?: ResolvedBindings
  private discoveryPrepared = false
  private readonly configResolvers: EnvironmentConfigResolver[] = []
  private remoteInvoke?: RemoteInvokeBinding
  private blobStore?: CapabilityBlobStore
  private artifactStore?: CapabilityArtifactStore
  private readonly services = new ServiceMap()
  private registry: Registry
  private extensionBindings: ExtensionBindingBuilder[] = []
  private policyBindings: PolicyBindingBuilder[] = []

  constructor(
    private readonly environmentDef: EnvironmentDefinition,
    private readonly envLabel: string | undefined,
    registry?: Registry
  ) {
    this.registry = registry ?? new Registry()
  }

  registerConfigResolver(resolver: EnvironmentConfigResolver): void {
    this.configResolvers.push(resolver)
  }

  /**
   * Bind a host service (for example a MediaStore).
   * A second call with the same `service` id replaces the previous one.
   * @category Environment
   */
  use(provider: ServiceProvider): this {
    this.services.use(provider)
    return this
  }

  /**
   * Look up a service bound with {@link Environment.use}.
   * @category Environment
   */
  get<T extends ServiceProvider>(token: ServiceToken<T>): T | undefined {
    return this.services.get(token)
  }

  /** @internal Service map for run/invoke capability context. */
  getServices(): ServiceMap {
    return this.services.clone()
  }

  /**
   * Bind extensions and policies. Call more than once to accumulate.
   * @category Environment
   */
  with(bindings: EnvironmentBinding[]): this {
    for (const binding of bindings) {
      const id = resolveId(binding.getRef())
      if (isPolicyBinding(binding)) {
        this.policyBindings.push(binding)
      } else {
        const existing = this.extensionBindings.find((b) => resolveId(b.getRef()) === id)
        if (existing) {
          existing.with(binding.getConfig())
          const range = binding.getRange()
          if (range) existing.requires(range, binding.getPackage())
        } else {
          this.extensionBindings.push(binding)
        }
      }
    }
    this.invalidatePrepared()
    return this
  }

  /** @internal Remote invoke pairing. */
  getRemoteInvoke(): RemoteInvokeBinding | undefined {
    return this.remoteInvoke
  }

  /** @internal Blob store. */
  getBlobStore(): CapabilityBlobStore | undefined {
    return this.blobStore
  }

  /** @internal Set the default blob store (used by {@link EcpImpl.getBlobStore}). */
  setBlobStore(store: CapabilityBlobStore): void {
    this.blobStore = store
  }

  /**
   * Ensure a blob store exists for browser locators / mixed hops.
   * @internal
   */
  ensureBlobStore(): CapabilityBlobStore {
    if (!this.blobStore) {
      this.blobStore = createCapabilityBlobStore()
    }
    return this.blobStore
  }

  /** @internal Artifact store. */
  getArtifactStore(): CapabilityArtifactStore | undefined {
    return this.artifactStore
  }

  /**
   * Ensure an artifact store exists for invoke/run (host outputs / `GET /v1/artifacts`).
   * @internal
   */
  ensureArtifactStore(): CapabilityArtifactStore {
    if (!this.artifactStore) {
      this.artifactStore = createCapabilityArtifactStore()
    }
    return this.artifactStore
  }

  /** Dynamically add or shallow-merge an extension binding (e.g. browser registry auto-bind). */
  addExtensionBinding(
    ref: NamespacedId | import("../definitions/types.js").ExtensionDefinition,
    config: Record<string, unknown> = {}
  ): void {
    this.with([extension(ref).with(config)])
  }

  /** Dynamically add a policy binding (policies are additive). */
  addPolicyBinding(
    ref: NamespacedId | PolicyDefinition,
    config: Record<string, unknown> = {}
  ): void {
    this.with([policy(ref).with(config)])
  }

  private invalidatePrepared(): void {
    this.resolved = undefined
    this.discoveryPrepared = false
  }

  private applyDefaultBindings(): void {
    for (const def of this.environmentDef.defaultExtensions ?? []) {
      if (!this.extensionBindings.some((b) => resolveId(b.getRef()) === def.id)) {
        this.extensionBindings.unshift(extension(def))
      }
    }
    if (!this.policyBindings.some((b) => resolveId(b.getRef()) === REGISTRY_CONTROL_POLICY_ID)) {
      this.policyBindings.unshift(policy(registryControlPolicy))
    }
  }

  private collectPolicyHooks(
    event: import("../types/index.js").PolicyLifecycleEvent
  ): Array<{ hook: HookDefinition; config: Record<string, unknown> }> {
    return this.policyBindings.flatMap((b) => {
      const id = resolveId(b.getRef())
      const def = this.registry.getPolicy(id)
      if (!def) return []
      return def.hooks
        .filter((h) => h.event === event)
        .map((hook) => ({ hook, config: b.getConfig() }))
    })
  }

  /** Evaluate bound policies before registry accepts a registration. */
  async evaluateRegistryRegistration(request: RegistryRegistrationRequest): Promise<void> {
    await this.prepareForDiscovery()
    const ctx: PolicyContext = {
      workflow: emptyWorkflowStub(),
      run: { id: this.envLabel ?? this.environmentDef.id, input: {} },
      step: REGISTRY_CHECK_STEP,
      state: {},
      input: {},
      usage: createUsageLedger(),
      scope: "environment",
      operation:
        request.kind === "extension"
          ? "registry.registerExtension"
          : request.kind === "policy"
            ? "registry.registerPolicy"
            : "registry.registerEnvironment",
      registryRequest: request,
    }
    const decision = await evaluatePolicies("policy:pre", this.collectPolicyHooks("policy:pre"), ctx)
    if (decision.type === "deny") {
      throw new RegistryRegistrationDeniedError(
        request.id,
        decision.reason ?? "Registration denied by policy"
      )
    }
  }

  private async emitEnvironmentEvent(
    event: import("../types/index.js").EnvironmentLifecycleEvent
  ): Promise<void> {
    const base = {
      event,
      workflow: emptyWorkflowStub(),
      run: { id: this.envLabel ?? this.environmentDef.id, input: {} },
      state: {},
      environment: this,
    }
    for (const binding of this.extensionBindings) {
      const id = resolveId(binding.getRef())
      const def = this.registry.getExtension(id)
      if (!def) continue
      const hooks = [...def.hooks]
        .filter((h) => h.event === event)
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      for (const h of hooks) {
        await h.handler({
          ...base,
          extensionConfig: binding.getConfig(),
        } as import("../runtime/context.js").LifecycleContext & {
          extensionConfig?: Record<string, unknown>
        })
      }
    }
  }

  /** Discovery path: configuring only (no ready). */
  private async prepareForDiscovery(): Promise<void> {
    if (this.discoveryPrepared) return

    this.applyDefaultBindings()
    await registerCoreFormats(this.registry)
    if (!this.registry.getEnvironment(this.environmentDef.id)) {
      await this.registry.registerEnvironment(this.environmentDef)
    }
    await this.ensureBoundExtensionsRegistered()
    await this.ensureBoundPoliciesRegistered()

    await this.emitEnvironmentEvent("environment:created")

    this.validateBindingConfigs("placeholder")
    await this.emitEnvironmentEvent("environment:configuring")
    this.discoveryPrepared = true
  }

  private validateBindingConfigs(phase: "placeholder" | "resolved"): void {
    for (const binding of this.extensionBindings) {
      const id = resolveId(binding.getRef())
      const def = this.registry.getExtension(id)
      const config =
        phase === "resolved"
          ? (this.resolved?.extensions.find((e) => e.id === id)?.config ?? binding.getConfig())
          : binding.getConfig()
      validateBoundConfig(def?.configSchema, config, id, phase)
    }
    for (const binding of this.policyBindings) {
      const id = resolveId(binding.getRef())
      const def = this.registry.getPolicy(id)
      const config =
        phase === "resolved"
          ? (this.resolved?.policies.find((p) => p.id === id)?.config ?? binding.getConfig())
          : binding.getConfig()
      validateBoundConfig(def?.configSchema, config, id, phase)
    }
  }

  private async ensureBoundPoliciesRegistered(): Promise<void> {
    for (const binding of this.policyBindings) {
      const ref = binding.getRef()
      if (isPolicyDefinition(ref)) {
        if (!this.registry.getPolicy(ref.id)) {
          await this.registry.registerPolicy(ref)
        }
        continue
      }
      const id = resolveId(ref)
      if (!this.registry.getPolicy(id)) {
        throw new Error(
          `Policy ${id} is not registered. Pass policy(definition) with the imported PolicyDefinition.`
        )
      }
    }
  }

  /** Run path: full binding resolution and ready. */
  private async prepareForRun(): Promise<ResolvedBindings> {
    await this.prepareForDiscovery()
    if (this.resolved) return this.resolved

    const envId = this.environmentDef.id

    const extensionBindings = this.extensionBindings.map((b, i) => ({
      id: resolveId(b.getRef()),
      label: b.getLabel(),
      order: i,
      rawConfig: b.getConfig(),
    }))

    const policyBindings = this.policyBindings.map((b, i) => ({
      id: resolveId(b.getRef()),
      label: b.getLabel(),
      order: i,
      rawConfig: b.getConfig(),
    }))

    const extensionHooks = extensionBindings.flatMap((ext) => {
      const def = this.registry.getExtension(ext.id)
      return def?.hooks ?? []
    })

    const policyHooks = policyBindings.flatMap((pol) => {
      const def = this.registry.getPolicy(pol.id)
      if (!def) return []
      return def.hooks.map((hook) => ({ hook, config: pol.rawConfig, policyId: pol.id }))
    })

    this.resolved = await resolveBindingsForRun(
      {
        id: envId,
        label: this.envLabel,
        rawConfig: {},
      },
      extensionBindings,
      policyBindings,
      extensionHooks,
      policyHooks,
      this.configResolvers
    )
    this.validateBindingConfigs("resolved")

    await this.emitEnvironmentEvent("environment:ready")
    return this.resolved
  }

  private resolveBindings(): ResolvedBindings {
    if (!this.resolved) {
      throw new Error("Environment not prepared for run; call init() or validate(workflow) first")
    }
    return this.resolved
  }

  /** @internal {@link EcpImpl} — resolved bindings after init. */
  ecpResolveBindings(): ResolvedBindings {
    return this.resolveBindings()
  }

  /** Prepare bindings for execution and emit environment:ready. */
  async ensureReady(): Promise<void> {
    await this.prepareForRun()
  }

  compile(): EnvironmentManifest {
    return {
      schema: "@executioncontrolprotocol.environment",
      version: LATEST_ECP_VERSION,
      environment: {
        id: this.environmentDef.id,
        ...(this.envLabel ? { label: this.envLabel } : {}),
      },
      runtime: {
        id: this.environmentDef.id,
        ...(this.envLabel ? { label: this.envLabel } : {}),
        config: manifestConfig({}),
      },
      extensions: this.extensionBindings.map((b, i) => ({
        id: resolveId(b.getRef()),
        ...(b.getLabel() ? { label: b.getLabel() } : {}),
        order: i,
        config: manifestConfig(b.getConfig()),
      })),
      policies: this.policyBindings.map((b, i) => ({
        id: resolveId(b.getRef()),
        ...(b.getLabel() ? { label: b.getLabel() } : {}),
        order: i,
        config: manifestConfig(b.getConfig()),
      })),
    }
  }

  getRegistry(): Registry {
    return this.registry
  }

  /**
   * Register extension definitions for all bindings.
   * Idempotent; safe to call before encode, decode, describe, or run.
   * @category Environment
   */
  async ensureBoundExtensionsRegistered(): Promise<void> {
    await ensureBoundExtensions(this.extensionBindings, this.registry)
  }

  /** Environment definition id. @category Environment */
  getEnvId(): string {
    return this.environmentDef.id
  }

  /** Environment label when set. @category Environment */
  getEnvLabel(): string | undefined {
    return this.envLabel
  }

  /** Bound environment definition id. @category Environment */
  getEnvironmentId(): string {
    return this.environmentDef.id
  }

  /**
   * Initialize environment for operational use and return an {@link Ecp} instance.
   * @category Environment
   */
  async init(options?: EnvironmentInitOptions): Promise<Ecp> {
    if (options?.registry) {
      this.registry = options.registry
      this.invalidatePrepared()
    }
    if (options?.blobStore) this.blobStore = options.blobStore
    if (options?.artifactStore) this.artifactStore = options.artifactStore
    if (options?.remoteInvoke) {
      this.remoteInvoke = {
        url: options.remoteInvoke.url.replace(/\/+$/, ""),
        token: options.remoteInvoke.token,
      }
    }
    await this.prepareForRun()
    return new EcpImpl(this)
  }

  /** @internal {@link EcpImpl} — describe. */
  async ecpDescribe(query?: DescribeQuery): Promise<EnvironmentDescriptor> {
    await this.prepareForDiscovery()
    const descriptor = await buildDescriptor(this.registry, this.compile(), query)
    if (this.remoteInvoke) {
      descriptor.remoteInvoke = { url: this.remoteInvoke.url }
    }
    return descriptor
  }

  /** @internal {@link EcpImpl} — search. */
  async ecpSearch(query: string, options?: SearchOptions): Promise<SearchResult> {
    await this.prepareForDiscovery()
    const descriptor = await buildDescriptor(this.registry, this.compile(), undefined, {
      searchIndex: true,
    })
    return searchCapabilities(query, descriptor, options)
  }

  /** @internal {@link EcpImpl} — validate. */
  async ecpValidate(workflow?: WorkflowManifest): Promise<ValidationResult> {
    if (workflow) {
      await this.prepareForRun()
      return validateEnvironmentWithWorkflow(
        workflow,
        await this.ecpDescribe(),
        this.resolveBindings(),
        this.registry,
        this.environmentDef.version
      )
    }
    await this.prepareForDiscovery()
    return {
      schema: "@executioncontrolprotocol.validation.result",
      version: LATEST_ECP_VERSION,
      valid: true,
      errors: [],
      warnings: [],
    }
  }

  /** @internal {@link EcpImpl} — terminate. */
  async ecpTerminate(): Promise<void> {
    await this.emitEnvironmentEvent("environment:terminate")
    this.invalidatePrepared()
  }

  /** @internal {@link EcpImpl} — invoke. */
  ecpInvoke(capabilityId: import("../types/index.js").CapabilityId) {
    return createInvokeBuilder(this, capabilityId)
  }

  /** @internal {@link EcpImpl} — run. */
  async ecpRun(workflow: WorkflowManifest, options?: RunOptions): Promise<RunResult> {
    await this.prepareForRun()
    const validation = await validateEnvironmentWithWorkflow(
      workflow,
      await this.ecpDescribe(),
      this.resolveBindings(),
      this.registry,
      this.environmentDef.version
    )
    if (!validation.valid) {
      throw new Error(
        `Workflow validation failed: ${validation.errors.map((e) => e.message).join("; ")}`
      )
    }
    const acceptsCheck = validateWorkflowAcceptsInput(workflow, options?.input)
    if (!acceptsCheck.ok) {
      throw new Error(acceptsCheck.message)
    }
    if (options?.dryRun) {
      return {
        schema: "@executioncontrolprotocol.run.result",
        version: LATEST_ECP_VERSION,
        run: { id: "dry-run", status: "completed" },
        state: options.input ?? {},
      }
    }

    await this.emitEnvironmentEvent("environment:beforeRun")

    const bindings = this.resolveBindings()
    const envDef = this.registry.getEnvironment(bindings.runtime.id)!
    const executor: RuntimeExecutor = envDef.executor

    return executor.execute(workflow, {
      runId: globalThis.crypto.randomUUID(),
      input: options?.input ?? {},
      registry: this.registry,
      bindings,
      signal: options?.signal,
      seedState: options?.seedState,
      seedHistory: options?.seedHistory,
      stopAfterStepId: options?.stopAfterStepId,
      onlyStepId: options?.onlyStepId,
      approvals: options?.approvals,
      journal: options?.journal,
      onEvent: options?.onEvent,
      remoteInvoke: this.remoteInvoke,
      blobs: options?.blobs ?? this.ensureBlobStore(),
      artifacts: this.ensureArtifactStore(),
      services: this.getServices(),
    })
  }
}

/**
 * Create an ECP environment. `id` is the environment definition id
 * (for example `@executioncontrolprotocol/node`); the optional label is the instance name.
 * @category Environment
 */
export function environment(id: string, label?: string): Environment {
  const def = getEnvironmentDefinition(id)
  if (!def) {
    throw new Error(
      `Environment definition ${id} is not registered. Import @executioncontrolprotocol/node or @executioncontrolprotocol/browser and call its environment() factory.`
    )
  }
  return new Environment(def, label)
}
