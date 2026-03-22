/**
 * TypeScript type definitions for the Execution Control Protocol (ECP)
 * Context manifest.
 *
 * Conventions:
 *
 *   Field names:       camelCase               (OpenAPI)
 *   Enum/union values: kebab-case              (OpenAPI)
 *   Type/interface:    PascalCase              (OpenAPI)
 *   Schema names:      PascalCase              (OpenAPI)
 *   JSDoc:             every export + property (MCP)
 *   @category tags:    on every export         (MCP)
 *   Interface extends: composition over repeat (MCP)
 *   _meta:             extensibility object    (MCP)
 *   description/title: on every major object   (OpenAPI + MCP)
 */

// ---------------------------------------------------------------------------
// Protocol version
// [MCP convention: export const for protocol version]
// ---------------------------------------------------------------------------

/** @internal */
export const LATEST_PROTOCOL_VERSION = "0.3-draft";

// ---------------------------------------------------------------------------
// JSON Schema primitives (aligned with JSON Schema Draft 2020-12)
// [OpenAPI convention: full JSON Schema type compatibility]
// ---------------------------------------------------------------------------

/**
 * The set of primitive type identifiers defined by JSON Schema Draft 2020-12.
 *
 * @category Schema
 */
export type JsonSchemaType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

// ---------------------------------------------------------------------------
// Base types (shared across multiple objects)
// [MCP convention: BaseMetadata extended by named objects]
// ---------------------------------------------------------------------------

/**
 * Base interface for objects that have a programmatic name and an optional
 * human-readable title. Mirrors MCP's `BaseMetadata`.
 *
 * @category Common
 */
export interface BaseMetadata {
  /**
   * Programmatic identifier. Used as a key/reference throughout the spec.
   */
  name: string;

  /**
   * Optional human-readable display name. If absent, clients should fall
   * back to `name`.
   */
  title?: string;
}

// ---------------------------------------------------------------------------
// Extensibility
// [MCP convention: _meta on every major object]
// ---------------------------------------------------------------------------

/**
 * Open-ended metadata bag that implementations can use for non-standard
 * extensions. Mirrors MCP's `_meta` pattern.
 *
 * @category Common
 */
export interface Extensible {
  /**
   * Implementation-specific metadata. The spec does not define the shape of
   * this object; consumers should treat unknown keys as opaque.
   */
  _meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Top-level Context
// ---------------------------------------------------------------------------

/**
 * The root object of an ECP manifest. A Context defines a complete,
 * portable execution environment for one or more AI agents.
 *
 * @category Context
 */
export interface ECPContext extends Extensible {
  /**
   * The ECP specification version this manifest conforms to
   * (e.g. `"ecp/v0.3-draft"`).
   */
  apiVersion: string;

  /**
   * Must be `"Context"`.
   */
  kind: "Context";

  /**
   * Metadata identifying and describing this Context.
   */
  metadata: Metadata;

  /**
   * Parameterised inputs that make the Context reusable across environments.
   */
  inputs?: Record<string, InputDefinition>;

  /**
   * Declared outputs produced by a Context run.
   */
  outputs?: OutputDefinition[];

  /**
   * Reusable JSON-Schema-like definitions referenced by executors and outputs.
   */
  schemas?: Record<string, SchemaDefinition>;

  /**
   * Events that initiate a Context run.
   */
  triggers?: Trigger[];

  /**
   * How the executors in this Context coordinate.
   */
  orchestration?: Orchestration;

  /**
   * The top-level orchestrator for this Context.
   *
   * When provided, this object is treated as the execution entry point.
   */
  orchestrator?: Orchestrator;

  /**
   * Legacy flat list of executor roles that participate in this Context.
   *
   * Newer Contexts may instead define execution roles under
   * {@link ECPContext.orchestrator}.
   */
  executors?: Executor[];

  /**
   * Declared plugins (model providers, executors, loggers, memory, …) and
   * runtime security controls for loading them.
   */
  plugins?: Plugins;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Identity and version information for a Context.
 *
 * @category Context
 */
export interface Metadata {
  /**
   * Machine-readable name for the Context (e.g. `"weekly-ecom-ops"`).
   */
  name: string;

  /**
   * Semantic version string (e.g. `"2.0.0"`).
   */
  version: string;

  /**
   * Optional human-readable summary of what the Context does.
   */
  description?: string;
}

// ---------------------------------------------------------------------------
// Plugins (model providers, executors, loggers, memory, …)
// ---------------------------------------------------------------------------

/**
 * Role of a plugin in the Context manifest and runtime registry.
 * `"tool"` denotes MCP (or similar) tool servers wired under system config `tools.servers`
 * and gated by `security.tools` / `security.plugins` on the host.
 * Additional values may be added by future spec versions.
 *
 * @category Context
 */
export type PluginKind = "provider" | "executor" | "logger" | "memory" | "tool";

/**
 * All defined {@link PluginKind} values (for CLI validation and docs).
 *
 * @category Context
 */
export const PLUGIN_KINDS: readonly PluginKind[] = [
  "provider",
  "executor",
  "logger",
  "memory",
  "tool",
] as const;

/**
 * The supported plugin artifact source types.
 *
 * @category Context
 */
export type ExtensionSourceType = "builtin" | "npm" | "git" | "local";

/**
 * A version string used by plugin references and manifests.
 *
 * @category Context
 */
export type ExtensionVersion = string;

/**
 * A portable reference to a loadable plugin artifact.
 *
 * @category Context
 */
export interface PluginReference extends BaseMetadata, Extensible {
  /**
   * Optional human-readable summary of what this plugin provides.
   */
  description?: string;

  /**
   * The plugin kind this reference resolves to.
   */
  kind: PluginKind;

  /**
   * The source type used to resolve this plugin.
   */
  type: ExtensionSourceType;

  /**
   * Plugin version identifier.
   *
   * For:
   * - `builtin`: the built-in plugin API/runtime version
   * - `npm`: a package version or semver range
   * - `git`: a tag or commit SHA
   * - `local`: a local module version label
   */
  version: ExtensionVersion;

  /**
   * NPM package name when `type` is `"npm"`.
   */
  packageName?: string;

  /**
   * Git repository URL when `type` is `"git"`.
   */
  repository?: string;

  /**
   * Local filesystem path when `type` is `"local"`.
   */
  path?: string;

  /**
   * Optional module entrypoint override.
   */
  entrypoint?: string;

  /**
   * Optional integrity hash/signature for artifact verification.
   */
  integrity?: string;
}

/**
 * Runtime security policy for plugin loading (Context `plugins.security` and,
 * on the host, system config `security.plugins`).
 * Security is always enabled. Use `allowKinds` and `allowSourceTypes` only to
 * restrict which plugin kinds/source types are allowed (default: all builtin allowed).
 * When `allowKinds` is set and omits `"tool"`, implementations should refuse MCP tool
 * server connections that are classified as tool plugins.
 *
 * @category Context
 */
export interface PluginSecurityPolicy extends Extensible {
  /**
   * Plugin kinds allowed to load at runtime.
   * When omitted, all kinds are allowed (default: allow all built-in plugins).
   * Include `"tool"` when Context or system config uses MCP servers under `tools.servers`.
   */
  allowKinds?: PluginKind[];

  /**
   * Source types allowed to load at runtime.
   * When omitted, only built-in plugins are allowed.
   */
  allowSourceTypes?: ExtensionSourceType[];

  /**
   * Explicit allow-list of plugin IDs (`PluginReference.name`).
   */
  allowIds?: string[];

  /**
   * Explicit deny-list of plugin IDs (`PluginReference.name`).
   */
  denyIds?: string[];

  /**
   * When `true`, unknown or disallowed plugin references fail startup.
   */
  strict?: boolean;
}

/**
 * Context-level plugin declaration block.
 *
 * @category Context
 */
export interface Plugins extends Extensible {
  /**
   * Version of the plugins block schema.
   */
  version: ExtensionVersion;

  /**
   * Optional human-readable description of plugin usage for this Context.
   */
  description?: string;

  /**
   * Registered model provider plugins.
   */
  providers?: PluginReference[];

  /**
   * Registered executor plugins.
   */
  executors?: PluginReference[];

  /**
   * Additional plugins (e.g. loggers, memory stores) that are not providers or executors.
   */
  entries?: PluginReference[];

  /**
   * Per-plugin configuration blobs keyed by plugin ID.
   */
  config?: Record<string, Record<string, unknown>>;

  /**
   * Runtime security controls for plugin loading.
   */
  security?: PluginSecurityPolicy;
}

/**
 * Returns the Context `plugins` block.
 *
 * @category Context
 */
export function getContextPlugins(ctx: ECPContext): Plugins | undefined {
  return ctx.plugins;
}

// ---------------------------------------------------------------------------
// Inputs / Outputs
// ---------------------------------------------------------------------------

/**
 * Primitive type identifiers accepted by `InputDefinition.type`.
 *
 * @category Inputs
 */
export type InputType = "string" | "number" | "boolean" | "integer";

/**
 * Declares a parameterised input for a Context, analogous to an
 * environment variable.
 *
 * @category Inputs
 */
export interface InputDefinition {
  /**
   * The data type of the input value.
   */
  type: InputType;

  /**
   * Whether the input must be provided when the Context is instantiated.
   */
  required?: boolean;

  /**
   * A default value used when the input is not explicitly supplied.
   */
  default?: string | number | boolean;
}

/**
 * Declares a named output produced by a Context run.
 *
 * @category Outputs
 */
export interface OutputDefinition extends Extensible {
  /**
   * Unique name for this output.
   */
  name: string;

  /**
   * Optional human-readable description of the output.
   */
  description?: string;

  /**
   * Name of the schema (in `schemas`) that defines the output shape.
   */
  fromSchema?: string;

  /**
   * Inline schema definition for the output shape.
   *
   * Use this when a reusable entry in `schemas` is not needed.
   */
  schema?: SchemaDefinition;

  /**
   * Where the output is delivered (TBD by future spec versions).
   */
  destination?: string;

  /**
   * How the output maps to downstream actions (TBD by future spec versions).
   */
  actionMapping?: string;
}

// ---------------------------------------------------------------------------
// Schemas (JSON-Schema-like objects embedded in the Context)
// [OpenAPI convention: align with JSON Schema Draft 2020-12 types]
// ---------------------------------------------------------------------------

/**
 * A JSON-Schema-like object definition embedded in a Context.
 *
 * @category Schema
 */
export interface SchemaDefinition {
  /**
   * The JSON Schema type for this definition (typically `"object"`).
   */
  type: JsonSchemaType;

  /**
   * Property names that must be present on conforming objects.
   */
  required?: string[];

  /**
   * Map of property names to their schema definitions.
   */
  properties?: Record<string, SchemaProperty>;

  /**
   * Optional human-readable description of this schema.
   */
  description?: string;
}

/**
 * Schema for a single property within a {@link SchemaDefinition}.
 *
 * @category Schema
 */
export interface SchemaProperty {
  /**
   * The JSON Schema type for this property.
   */
  type: JsonSchemaType;

  /**
   * For array types, the schema of each element.
   */
  items?: SchemaProperty;

  /**
   * Property names that must be present (when `type` is `"object"`).
   */
  required?: string[];

  /**
   * Nested properties (when `type` is `"object"`).
   */
  properties?: Record<string, SchemaProperty>;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/**
 * The event types that can initiate a Context run.
 *
 * @category Triggers
 */
export type TriggerType = "schedule" | "webhook" | "tool-event" | "manual";

/**
 * An event that initiates a Context run.
 *
 * @category Triggers
 */
export interface Trigger extends Extensible {
  /**
   * The kind of trigger.
   */
  type: TriggerType;

  /**
   * Optional human-readable description of when/why this trigger fires.
   */
  description?: string;

  /**
   * Cron expression (when `type` is `"schedule"`).
   */
  cron?: string;

  /**
   * IANA timezone for cron evaluation (e.g. `"America/Vancouver"`).
   */
  timezone?: string;

  /**
   * Webhook URL (when `type` is `"webhook"`).
   */
  url?: string;

  /**
   * Event name (when `type` is `"tool-event"`).
   */
  event?: string;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * The coordination strategy used to organise executor interactions.
 *
 * @category Orchestration
 */
export type OrchestrationStrategy =
  | "single"
  | "sequential"
  | "delegate"
  | "swarm";

/**
 * Sensible defaults applied to orchestration-level communication.
 *
 * @category Orchestration
 */
export interface OrchestrationDefaults {
  /**
   * Maximum number of delegation requests the orchestrator may issue.
   */
  maxDelegations?: number;

  /**
   * Maximum number of specialist executors that may run concurrently.
   */
  maxExecutors?: number;

  /**
   * Global timeout for the Context run, in milliseconds.
   */
  timeoutMs?: number;
}

/**
 * Context-level declaration of how executors work together.
 *
 * @category Orchestration
 */
export interface Orchestration extends Extensible {
  /**
   * Name of the executor that serves as the entry point.
   *
   * Deprecated: in newer manifests, the entry point is the top-level
   * {@link ECPContext.orchestrator}.
   */
  entrypoint?: string;

  /**
   * The coordination strategy (see {@link OrchestrationStrategy}).
   */
  strategy?: OrchestrationStrategy;

  /**
   * Optional human-readable description of the orchestration approach.
   */
  description?: string;

  /**
   * Default constraints for delegation and timeouts.
   */
  defaults?: OrchestrationDefaults;

  /**
   * Schema names whose outputs must be produced before the run completes.
   */
  requires?: string[];

  /**
   * Schema name for the final merged output of the run.
   */
  produces?: string;
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

/**
 * The kind of agent that implements an executor role.
 *
 * @category Executors
 */
export type ExecutorType = "agent" | "tool" | "human";

/**
 * Identifies a communication protocol supported by an executor.
 *
 * @category Executors
 */
export type ProtocolType = "a2a" | "mcp";

/**
 * Configuration for a single protocol binding on an executor.
 *
 * @category Executors
 */
export interface ProtocolConfig {
  /**
   * Protocol identifier (see {@link ProtocolType}).
   */
  type: ProtocolType;

  /**
   * Protocol version string (e.g. `"v1"`, `"v0.1"`).
   */
  version: string;
}

/**
 * Map of protocol roles to their configurations on an executor.
 *
 * @category Executors
 */
export interface Protocols {
  /**
   * Protocol used for agent-to-agent orchestration.
   */
  agentOrchestration?: ProtocolConfig;

  /**
   * Protocol used for tool invocation.
   */
  toolInvocation?: ProtocolConfig;
}

/**
 * LLM provider and model selection for an executor.
 *
 * @category Executors
 */
export type ModelProviderId = string;

/**
 * Portable model provider selector that supports built-ins and external
 * extension sources.
 *
 * @category Executors
 */
export interface ModelProviderReference extends Extensible {
  /**
   * Provider ID (must match `PluginReference.name` when using
   * `ECPContext.plugins.providers`).
   */
  name: ModelProviderId;

  /**
   * Provider source type.
   */
  type: ExtensionSourceType;

  /**
   * Provider extension version.
   */
  version: ExtensionVersion;
}

/**
 * The selector shape for an executor model provider.
 *
 * @category Executors
 */
export type ModelProviderSelector = ModelProviderId | ModelProviderReference;

/**
 * LLM provider and model selection for an executor.
 *
 * @category Executors
 */
export interface ModelConfig {
  /**
   * Model provider selector.
   *
   * Supports:
   * - string IDs (legacy, e.g. `"openai"`)
   * - structured plugin refs (e.g.
   *   `{ name: "openai", type: "builtin", version: "0.3.0" }`)
   */
  provider: ModelProviderSelector;

  /**
   * Model identifier (e.g. `"gpt-5"`, `"claude-4"`).
   */
  name: string;
}

// ---------------------------------------------------------------------------
// Mounts (staged context hydration)
// ---------------------------------------------------------------------------

/**
 * The hydration stage at which a mount is evaluated.
 *
 * @category Mounts
 */
export type MountStage = "seed" | "focus" | "deep";

/**
 * Specifies which MCP server and tool to call for data retrieval.
 *
 * @category Mounts
 */
export interface MountFrom {
  /**
   * Name of the MCP server that provides the data.
   */
  server: string;

  /**
   * Tool name on the MCP server (e.g. `"issues.search"`).
   */
  tool: string;

  /**
   * Arguments passed to the tool call. Values may contain input
   * interpolation expressions like `"${inputs.jiraProject}"`.
   */
  args?: Record<string, unknown>;
}

/**
 * Conditions that gate a mount's evaluation, typically driven by
 * the orchestrator's plan output.
 *
 * @category Mounts
 */
export interface MountWhen {
  /**
   * Dot-path into the plan output that yields the IDs to expand
   * (e.g. `"plan.selectedIssueIds"`).
   */
  selectorFrom?: string;

  /**
   * Upper bound on how many items may be selected for expansion.
   */
  maxSelected?: number;
}

/**
 * Hard limits on the data returned by a mount.
 *
 * @category Mounts
 */
export interface MountLimits {
  /**
   * Maximum number of items the mount may return.
   */
  maxItems?: number;
}

/**
 * A data source bound to an executor at a specific hydration stage.
 *
 * @category Mounts
 */
export interface Mount extends BaseMetadata, Extensible {
  /**
   * The hydration stage (see {@link MountStage}).
   */
  stage: MountStage;

  /**
   * Optional human-readable description of what this mount provides.
   */
  description?: string;

  /**
   * The MCP server + tool that supplies data.
   */
  from: MountFrom;

  /**
   * Conditions that must be met before this mount is evaluated.
   */
  when?: MountWhen;

  /**
   * The expected return type (e.g. `"IssueRef[]"`).
   */
  asType?: string;

  /**
   * Hard limits on the data returned.
   */
  limits?: MountLimits;
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

/**
 * Controls whether an executor may issue write operations.
 *
 * @category Policies
 */
export type WriteControlMode = "forbid" | "propose-only" | "execute-if-allowed";

/**
 * Allowlist/denylist controlling which tools an executor may invoke.
 *
 * @category Policies
 */
export interface ToolAccess {
  /**
   * The default posture: `"deny"` blocks all tools unless explicitly
   * allowed; `"allow"` permits all unless explicitly denied.
   */
  default: "deny" | "allow";

  /**
   * Tool names explicitly permitted (when default is `"deny"`).
   */
  allow?: string[];

  /**
   * Tool names explicitly blocked (when default is `"allow"`).
   */
  deny?: string[];
}

/**
 * Runtime budget constraints for an executor.
 *
 * @category Policies
 */
export interface Budgets {
  /**
   * Maximum number of tool invocations the executor may make.
   * Must be >= 1 when specified.
   *
   * @minimum 1
   */
  maxToolCalls?: number;

  /**
   * Maximum wall-clock runtime in seconds.
   * Must be >= 1 when specified.
   *
   * @minimum 1
   */
  maxRuntimeSeconds?: number;

}

/**
 * Controls governing write operations for an executor.
 *
 * @category Policies
 */
export interface WriteControls {
  /**
   * The write control mode (see {@link WriteControlMode}).
   */
  mode: WriteControlMode;

  /**
   * Tool names that require explicit approval before execution
   * (when mode is `"propose-only"`).
   */
  requireApprovalFor?: string[];
}

// ---------------------------------------------------------------------------
// Memory (long-term store, policy-controlled)
// ---------------------------------------------------------------------------

/**
 * Scope for long-term memory storage. Access is policy-driven; no executor
 * gets long-term memory by default.
 *
 * @category Policies
 */
export type MemoryScope = "user" | "context" | "org";

/**
 * Policy governing an executor's access to long-term memory.
 * When omitted, the executor has no long-term memory access.
 *
 * @category Policies
 */
export interface MemoryAccessPolicy extends Extensible {
  /**
   * Whether the executor may read from the memory store bound via
   * {@link Executor.memory}. Default is false when policy is present.
   */
  allowRead?: boolean;

  /**
   * Whether the executor may write (store or delete) in the memory store.
   * Default is false when policy is present.
   */
  allowWrite?: boolean;
}

/**
 * Reference to a long-term memory store bound to an executor. When present,
 * the executor may access the store subject to {@link Policies.memoryAccess}.
 *
 * @category Mounts
 */
export interface MemoryStoreRef extends Extensible {
  /**
   * Scope of the memory store (user, context, or org).
   */
  scope: MemoryScope;

  /**
   * Optional human-readable description of what this memory store is used for.
   */
  description?: string;

  /**
   * Maximum number of memory items to inject into the executor's context.
   * Helps avoid exceeding model context windows.
   *
   * @minimum 1
   */
  maxItems?: number;

  /**
   * Approximate maximum tokens for injected memory content. When set, the
   * runtime should truncate or summarize to stay under this limit.
   *
   * @minimum 1
   */
  maxTokens?: number;
}

/**
 * The complete security policy applied to an executor.
 *
 * @category Policies
 */
export interface Policies {
  /**
   * Which tools the executor may invoke.
   */
  toolAccess?: ToolAccess;

  /**
   * Runtime budget constraints.
   */
  budgets?: Budgets;

  /**
   * Write operation governance.
   */
  writeControls?: WriteControls;

  /**
   * Long-term memory access. When omitted, the executor has no memory access.
   * Only applies when the executor declares {@link Executor.memory}.
   */
  memoryAccess?: MemoryAccessPolicy;
}

// ---------------------------------------------------------------------------
// Executor
// [MCP convention: extends BaseMetadata for name/title, Extensible for _meta]
// ---------------------------------------------------------------------------

/**
 * An agent role within a Context. Each executor defines its own protocols,
 * mounts, model configuration, and security policies.
 *
 * @category Executors
 */
export interface Executor extends BaseMetadata, Extensible {
  /**
   * The kind of agent (see {@link ExecutorType}).
   */
  type: ExecutorType;

  /**
   * Optional human-readable description of this executor's role.
   */
  description?: string;

  /**
   * Structured inputs expected by this executor.
   */
  inputs?: Record<string, InputDefinition>;

  /**
   * Structured outputs produced by this executor.
   */
  outputs?: OutputDefinition[];

  /**
   * Protocol bindings for orchestration and tool invocation.
   */
  protocols?: Protocols;

  /**
   * LLM provider and model selection.
   */
  model?: ModelConfig;

  /**
   * System-level instructions provided to the agent.
   */
  instructions?: string;

  /**
   * Reference to the schema this executor expects as input
   * (e.g. `"#/schemas/PlanInput"`).
   */
  inputSchemaRef?: string;

  /**
   * Inline schema for executor input, used when a shared schema reference is
   * not desired.
   */
  inputSchema?: SchemaDefinition;

  /**
   * Reference to the schema this executor must produce
   * (e.g. `"#/schemas/Plan"`).
   */
  outputSchemaRef?: string;

  /**
   * Inline schema for executor output, used when a shared schema reference is
   * not desired.
   */
  outputSchema?: SchemaDefinition;

  /**
   * Data sources available to this executor at various hydration stages.
   */
  mounts?: Mount[];

  /**
   * Optional long-term memory store binding. When set, the executor may read
   * or write memory (subject to {@link Policies.memoryAccess}) to refine
   * output across runs. Access is explicit and policy-controlled.
   */
  memory?: MemoryStoreRef;

  /**
   * Security policy governing tool access, budgets, and writes.
   */
  policies?: Policies;
}

/**
 * Coordinating execution node that can contain child executors and nested
 * orchestrators.
 *
 * @category Orchestration
 */
export interface Orchestrator extends Executor {
  /**
   * Optional strategy override for this orchestrator node.
   */
  strategy?: OrchestrationStrategy;

  /**
   * Child executors coordinated by this orchestrator.
   */
  executors?: Executor[];

  /**
   * Nested orchestrators coordinated by this orchestrator.
   */
  orchestrators?: Orchestrator[];
}
