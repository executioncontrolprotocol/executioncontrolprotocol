/**
 * TypeScript type definitions for the Execution Control Protocol (ECP)
 * Context manifest (ecp/v0.3-draft).
 */

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

export interface InputDefinition {
  type: "string" | "number" | "boolean" | "integer";
  required?: boolean;
  default?: string | number | boolean;
}

export interface OutputDefinition {
  name: string;
  fromSchema: string;
  destination?: string;
  actionMapping?: string;
}

// ---------------------------------------------------------------------------
// Schemas (JSON-Schema-like objects embedded in the Context)
// ---------------------------------------------------------------------------

export interface SchemaDefinition {
  type: string;
  required?: string[];
  properties?: Record<string, SchemaProperty>;
}

export interface SchemaProperty {
  type: string;
  items?: SchemaProperty;
  required?: string[];
  properties?: Record<string, SchemaProperty>;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type TriggerType = "schedule" | "webhook" | "toolEvent" | "manual";

export interface Trigger {
  type: TriggerType;
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
  defaults?: OrchestrationDefaults;
  requires?: string[];
  produces?: string;
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

export type ExecutorType = "llm-agent" | "tool-agent" | "human";

export interface ProtocolConfig {
  type: string;
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
// ---------------------------------------------------------------------------

export interface Executor {
  name: string;
  type: ExecutorType;
  protocols?: Protocols;
  model?: ModelConfig;
  instructions?: string;
  outputSchemaRef?: string;
  mounts?: Mount[];
  policies?: Policies;
}
