/**
 * TypeScript type definitions for the Execution Control Protocol (ECP)
 * Context manifest (ecp/v0.3-draft).
 *
 * Conventions (derived from the OpenAPI Specification):
 *
 *   - Field names:       camelCase         (e.g. outputSchemaRef, maxToolCalls)
 *   - Enum/union values: kebab-case        (e.g. "controller-specialist", "tool-event")
 *   - Type/interface:    PascalCase        (e.g. ECPContext, MountStage)
 *   - Schema names:      PascalCase        (e.g. Plan, RevenueFindings)
 *   - description field: optional on every major object
 *   - JSON Schema types: aligned with JSON Schema Draft 2020-12
 */

// ---------------------------------------------------------------------------
// JSON Schema primitives (aligned with JSON Schema Draft 2020-12)
// [OpenAPI convention: full JSON Schema type compatibility]
// ---------------------------------------------------------------------------

export type JsonSchemaType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

// ---------------------------------------------------------------------------
// Top-level Context
// ---------------------------------------------------------------------------

export interface ECPContext {
  apiVersion: string;
  kind: "Context";
  metadata: Metadata;
  inputs?: Record<string, InputDefinition>;
  outputs?: OutputDefinition[];
  schemas?: Record<string, SchemaDefinition>;
  triggers?: Trigger[];
  orchestration: Orchestration;
  executors: Executor[];
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export interface Metadata {
  name: string;
  version: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Inputs / Outputs
// ---------------------------------------------------------------------------

export type InputType = "string" | "number" | "boolean" | "integer";

export interface InputDefinition {
  type: InputType;
  required?: boolean;
  default?: string | number | boolean;
}

export interface OutputDefinition {
  name: string;
  description?: string;
  fromSchema: string;
  destination?: string;
  actionMapping?: string;
}

// ---------------------------------------------------------------------------
// Schemas (JSON-Schema-like objects embedded in the Context)
// [OpenAPI convention: align with JSON Schema Draft 2020-12 types]
// ---------------------------------------------------------------------------

export interface SchemaDefinition {
  type: JsonSchemaType;
  required?: string[];
  properties?: Record<string, SchemaProperty>;
  description?: string;
}

export interface SchemaProperty {
  type: JsonSchemaType;
  items?: SchemaProperty;
  required?: string[];
  properties?: Record<string, SchemaProperty>;
}

// ---------------------------------------------------------------------------
// Triggers
// [OpenAPI convention: kebab-case for enum values — "toolEvent" → "tool-event"]
// ---------------------------------------------------------------------------

export type TriggerType = "schedule" | "webhook" | "tool-event" | "manual";

export interface Trigger {
  type: TriggerType;
  description?: string;
  cron?: string;
  timezone?: string;
  url?: string;
  event?: string;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type OrchestrationStrategy =
  | "single"
  | "controller-specialist"
  | "delegate"
  | "swarm";

export interface OrchestrationDefaults {
  maxDelegations?: number;
  maxExecutors?: number;
  timeoutMs?: number;
}

export interface Orchestration {
  entrypoint: string;
  strategy: OrchestrationStrategy;
  description?: string;
  defaults?: OrchestrationDefaults;
  requires?: string[];
  produces?: string;
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

export type ExecutorType = "llm-agent" | "tool-agent" | "human";

// [OpenAPI convention: no primitives for spec-specific values]
export type ProtocolType = "a2a" | "mcp";

export interface ProtocolConfig {
  type: ProtocolType;
  version: string;
}

export interface Protocols {
  agentOrchestration?: ProtocolConfig;
  toolInvocation?: ProtocolConfig;
}

export interface ModelConfig {
  provider: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Mounts (staged context hydration)
// ---------------------------------------------------------------------------

export type MountStage = "seed" | "focus" | "deep";

export interface MountFrom {
  server: string;
  tool: string;
  args?: Record<string, unknown>;
}

export interface MountWhen {
  selectorFrom?: string;
  maxSelected?: number;
}

export interface MountLimits {
  maxItems?: number;
}

export interface Mount {
  name: string;
  stage: MountStage;
  description?: string;
  from: MountFrom;
  when?: MountWhen;
  asType?: string;
  limits?: MountLimits;
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export type WriteControlMode = "forbid" | "propose-only" | "execute-if-allowed";

export interface ToolAccess {
  default: "deny" | "allow";
  allow?: string[];
  deny?: string[];
}

export interface Budgets {
  maxToolCalls?: number;
  maxRuntimeSeconds?: number;
  maxCostUsd?: number;
}

export interface WriteControls {
  mode: WriteControlMode;
  requireApprovalFor?: string[];
}

export interface Policies {
  toolAccess?: ToolAccess;
  budgets?: Budgets;
  writeControls?: WriteControls;
}

// ---------------------------------------------------------------------------
// Executor
// [OpenAPI convention: description on every major object]
// ---------------------------------------------------------------------------

export interface Executor {
  name: string;
  type: ExecutorType;
  description?: string;
  protocols?: Protocols;
  model?: ModelConfig;
  instructions?: string;
  outputSchemaRef?: string;
  mounts?: Mount[];
  policies?: Policies;
}
