# ECP Implementation Specification v1.0

This document is the implementation source of truth for the current ECP architecture. It captures the latest decisions on the fluent API, object model, lifecycle, environment/runtime split, workflow manifests, validation, MCP integration, and package architecture.

---

# 1. Executive Summary

ECP is a TypeScript-first workflow authoring and execution protocol.

The core separation is:

| Layer           | Purpose                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Definitions** | Define reusable runtimes, extensions, policies, capabilities, and hooks.                                              |
| **Environment** | A running configured execution container with runtime, extensions, policies, secrets, registry, and lifecycle engine. |
| **Workflow**    | A portable, environment-free execution graph.                                                                         |
| **Run**         | Execution of a workflow manifest inside an environment.                                                               |
| **MCP adapter** | Agent-facing tool/resource/prompt layer over an environment.                                                          |

The most important rule:

> **Workflow manifests are portable execution graphs. They do not contain runtime config, extension config, policy config, secrets, or environment details. Environments execute workflows.**

---

# 2. Package Architecture

## 2.1 Packages

Implement as a monorepo.

```txt
packages/
  types/
  core/
  mcp/
  cli/
  policies/

  runtimes/
    node/
    browser/
    temporal/

  extensions/
    index/
    memory/
    openai/
    slack/
    storage/
    telemetry/
```

## 2.2 Published packages

| Package                                         | Purpose                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@executioncontrolprotocol/types`               | Protocol types, schema constants, JSON schema artifacts, lifecycle event types.                               |
| `@executioncontrolprotocol/core`                | Fluent API, definitions, environment, registry, local runtime, lifecycle engine, validation, local execution. |
| `@executioncontrolprotocol/mcp`                 | MCP server adapter exposing an ECP environment to agents.                                                     |
| `@executioncontrolprotocol/cli`                 | CLI for compile, validate, describe, run, and MCP serving.                                                    |
| `@executioncontrolprotocol/policies`            | Standard policies such as budget, approval, citations.                                                        |
| `@executioncontrolprotocol/runtime-temporal`    | Optional Temporal runtime adapter.                                                                            |
| `@executioncontrolprotocol/extension-memory`    | Memory capabilities and lifecycle hooks.                                                                      |
| `@executioncontrolprotocol/extension-openai`    | OpenAI model capabilities.                                                                                    |
| `@executioncontrolprotocol/extension-slack`     | Slack capabilities.                                                                                           |
| `@executioncontrolprotocol/extension-storage`   | Storage capabilities.                                                                                         |
| `@executioncontrolprotocol/extension-telemetry` | Telemetry lifecycle hooks.                                                                                    |
| `@executioncontrolprotocol/extensions`          | Optional convenience bundle/re-export package.                                                                |

## 2.3 Dependency direction

```txt
@executioncontrolprotocol/types
   ↑
@executioncontrolprotocol/core
   ↑
@executioncontrolprotocol/mcp
@executioncontrolprotocol/cli
@executioncontrolprotocol/policies
@executioncontrolprotocol/runtime-temporal
@executioncontrolprotocol/extension-*
@executioncontrolprotocol/extensions
```

Rules:

| Rule                                         | Decision                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `@executioncontrolprotocol/types`            | Dependency-light, no runtime dependencies.                                               |
| `@executioncontrolprotocol/core`             | Main package. Includes local execution.                                                  |
| `@executioncontrolprotocol/mcp`              | Separate because MCP SDK is optional.                                                    |
| `@executioncontrolprotocol/runtime-temporal` | Separate because Temporal SDK is optional/heavy.                                         |
| Extensions                                   | Installed one by one for production.                                                     |
| `@executioncontrolprotocol/extensions`       | Optional convenience package; avoid forcing heavy transitive dependencies when possible. |

---

# 3. Core Concepts

## 3.1 Definitions vs bindings vs invocations

| Concept    | Example                                                                 | Purpose                                        |
| ---------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| Definition | `defineExtension("@executioncontrolprotocol", "memory")`                | Defines reusable implementation/contract.      |
| Binding    | `extension("@executioncontrolprotocol/memory", "Memory").with({...})`   | Configures a definition inside an environment. |
| Invocation | `step("@executioncontrolprotocol/memory.search", "Search").with({...})` | Executes a capability inside a workflow.       |

## 3.2 Namespacing

Definitions use namespace + name.

```ts
defineExtension("@executioncontrolprotocol", "memory");
defineRuntime("@executioncontrolprotocol", "local");
definePolicy("@executioncontrolprotocol", "budget");
```

IDs:

| Definition              | ID                                        |
| ----------------------- | ----------------------------------------- |
| Extension               | `@executioncontrolprotocol/memory`        |
| Runtime                 | `@executioncontrolprotocol/local`         |
| Policy                  | `@executioncontrolprotocol/budget`        |
| Capability on extension | `@executioncontrolprotocol/memory.search` |

## 3.3 JSON schema/version convention

Every serialized ECP object must include:

```json
{
  "schema": "@executioncontrolprotocol.workflow",
  "version": "1.0"
}
```

| Object                    | Schema                                           |
| ------------------------- | ------------------------------------------------ |
| Workflow manifest         | `@executioncontrolprotocol.workflow`             |
| Environment manifest      | `@executioncontrolprotocol.environment`          |
| Environment descriptor    | `@executioncontrolprotocol.environment.describe` |
| Environment search result | `@executioncontrolprotocol.environment.search`   |
| Run request               | `@executioncontrolprotocol.run.request`          |
| Run result                | `@executioncontrolprotocol.run.result`           |
| Run event                 | `@executioncontrolprotocol.run.event`            |
| Validation result         | `@executioncontrolprotocol.validation.result`    |

---

# 4. Public Fluent API

## 4.1 Definition API

```ts
defineRuntime(namespace, name)
  .withConfig(configSchema)
  .withExecutor(executor)

defineExtension(namespace, name)
  .withConfig(configSchema)
  .withCapabilities(capabilities)
  .withHooks(hooks)

definePolicy(namespace, name)
  .withConfig(configSchema)
  .withHooks(hooks)

capability(name)
  .withInput(inputSchema)
  .withOutput(outputSchema)
  .withHandler(handler)

hook(eventName, handler)
```

Removed from the core fluent API:

```ts
.withRequirements(...)
.withMetadata(...)
.withSideEffects(...)
.withImplementation(...)
```

## 4.2 Binding API

```ts
runtime(ref, label?).with(config)

extension(ref, label?).with(config)

policy(ref, label?).with(config)

step(ref, label?).with(input).as(stateKey?, options?)
```

Where:

| Parameter    | Meaning                                                 |
| ------------ | ------------------------------------------------------- |
| `ref`        | Imported object or registry string.                     |
| `label`      | Public-facing UI/log/graph label.                       |
| `.with(...)` | Config for runtime/extension/policy, or input for step. |
| `.as(...)`   | Commits step output to workflow state.                  |

## 4.3 Workflow/environment API

```ts
workflow(label)
  .run(nodes)
  .compile()
  .validate(environmentDescriptor?)
  .toManifest()
  .toGraph()

environment(id, label?)
  .withRuntime(runtimeBinding)
  .withExtensions(extensionBindings)
  .withPolicies(policyBindings)
  .compile()
  .validate(workflowManifest?)
  .describe(query?)
  .search(query, options?)
  .run(workflowManifest, options?)
```

## 4.4 Reference helpers

```ts
ref(path, options?)
env(name, options?)
```

| Helper                  | Scope                  | Serialized form                     |
| ----------------------- | ---------------------- | ----------------------------------- |
| `ref("brief.content")`  | Workflow state/input   | `{ "$ref": "state.brief.content" }` |
| `env("OPENAI_API_KEY")` | Environment setup only | `{ "$env": "OPENAI_API_KEY" }`      |

Important:

> `env()` is for environment setup, not portable workflow manifests. Workflow manifests should normally not contain `$env`.

---

# 5. TypeScript Interface Sketch

## 5.1 Common IDs

```ts
export type EcpVersion = `${number}.${number}`;
export type EcpSchema =
  | "@executioncontrolprotocol.workflow"
  | "@executioncontrolprotocol.environment"
  | "@executioncontrolprotocol.environment.describe"
  | "@executioncontrolprotocol.environment.search"
  | "@executioncontrolprotocol.run.request"
  | "@executioncontrolprotocol.run.result"
  | "@executioncontrolprotocol.run.event"
  | "@executioncontrolprotocol.validation.result";

export type EcpRef = string;

export type NamespacedId = `@${string}/${string}`;
export type CapabilityId = `${NamespacedId}.${string}`;
```

## 5.2 Workflow manifest

```ts
export interface WorkflowManifest {
  schema: "@executioncontrolprotocol.workflow";
  version: EcpVersion;
  workflow: {
    id: string;
    label?: string;
  };
  steps: WorkflowNode[];
}

export type WorkflowNode =
  | StepNode
  | ParallelNode
  | BranchNode
  | LoopNode;

export interface StepNode {
  type?: "step";
  id: string;
  label?: string;
  uses: CapabilityId | string;
  input?: Record<string, unknown>;
  commitAs?: string;
  commitMode?: "create" | "replace" | "merge" | "append" | "version";
  when?: ExprValue;
}

export interface ParallelNode {
  type: "parallel";
  id: string;
  label?: string;
  branches: WorkflowNode[][];
}

export interface BranchNode {
  type: "branch";
  id: string;
  label?: string;
  branches: Array<{
    label?: string;
    when: ExprValue;
    steps: WorkflowNode[];
  }>;
}

export interface LoopNode {
  type: "loop";
  id: string;
  label?: string;
  until?: ExprValue;
  maxRounds?: number;
  steps: WorkflowNode[];
}
```

## 5.3 Refs and envs

```ts
export interface RefValue {
  $ref: string;
  optional?: boolean;
  fallback?: unknown;
}

export interface EnvValue {
  $env: string;
  optional?: boolean;
  fallback?: unknown;
}
```

## 5.4 Environment manifest

```ts
export interface EnvironmentManifest {
  schema: "@executioncontrolprotocol.environment";
  version: EcpVersion;
  environment: {
    id: string;
    label?: string;
  };
  runtime?: RuntimeBindingManifest;
  extensions?: ExtensionBindingManifest[];
  policies?: PolicyBindingManifest[];
}

export interface RuntimeBindingManifest {
  id: string;
  label?: string;
  config?: Record<string, unknown>;
}

export interface ExtensionBindingManifest {
  id: string;
  label?: string;
  order: number;
  config?: Record<string, unknown>;
}

export interface PolicyBindingManifest {
  id: string;
  label?: string;
  order: number;
  config?: Record<string, unknown>;
}
```

## 5.5 Environment descriptor

```ts
export interface EnvironmentDescriptor {
  schema: "@executioncontrolprotocol.environment.describe";
  version: EcpVersion;
  environment: {
    id: string;
    label?: string;
  };
  runtime: RuntimeDescription;
  extensions: ExtensionDescription[];
  capabilities: CapabilityDescription[];
  policies: PolicyDescription[];
}

export interface RuntimeDescription {
  id: string;
  label?: string;
  features: RuntimeFeatures;
}

export interface RuntimeFeatures {
  durableExecution?: boolean;
  loops?: boolean;
  parallel?: boolean;
  branches?: boolean;
  pauses?: boolean;
  cancellation?: boolean;
  longRunningWorkflows?: boolean;
}

export interface ExtensionDescription {
  id: string;
  label?: string;
  order: number;
  configSchema?: unknown;
  capabilities: string[];
}

export interface CapabilityDescription {
  id: string;
  label?: string;
  extension: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  examples?: unknown[];
}

export interface PolicyDescription {
  id: string;
  label?: string;
  summary?: string;
  config?: Record<string, unknown>;
  configSchema?: unknown;
}
```

## 5.6 Validation

```ts
export interface ValidationResult {
  schema: "@executioncontrolprotocol.validation.result";
  version: EcpVersion;
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
  suggestions?: string[];
  severity?: "error" | "warning" | "info";
}
```

## 5.7 Run result

```ts
export interface RunRequest {
  schema: "@executioncontrolprotocol.run.request";
  version: EcpVersion;
  workflow: WorkflowManifest;
  input?: Record<string, unknown>;
  actor?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface RunResult {
  schema: "@executioncontrolprotocol.run.result";
  version: EcpVersion;
  run: {
    id: string;
    status: RunStatus;
  };
  state?: Record<string, unknown>;
  history?: Record<string, StepRunRecord>;
  usage?: Record<string, unknown>;
}

export type RunStatus =
  | "created"
  | "started"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export interface StepRunRecord {
  status: RunStatus;
  output?: unknown;
  committedAs?: string | null;
  attempts?: number;
  usage?: Record<string, unknown>;
}
```

---

# 6. Lifecycle Specification

## 6.1 Public lifecycle events

Only these lifecycle scopes are public:

* `run`
* `step`
* `policy`

No public hooks for:

* capability lifecycle
* state lifecycle
* model/tool/memory subcalls
* retry lifecycle

## 6.2 Event names

```ts
export type RunLifecycleEvent =
  | "run:before"
  | "run:started"
  | "run:completed"
  | "run:failed"
  | "run:cancelled"
  | "run:finally";

export type StepLifecycleEvent =
  | "step:before"
  | "step:started"
  | "step:completed"
  | "step:failed"
  | "step:cancelled"
  | "step:paused"
  | "step:finally";

export type PolicyLifecycleEvent =
  | "policy:pre"
  | "policy:post"
  | "policy:finally";

export type LifecycleEvent =
  | RunLifecycleEvent
  | StepLifecycleEvent
  | PolicyLifecycleEvent;
```

## 6.3 Lifecycle order

```txt
run:before
run:started

for each step:
  step:before

  policy:pre

  step:started
    execute capability
    runtime handles retries according to policy

  policy:post

  step:completed | step:failed | step:cancelled | step:paused

  step:finally
  policy:finally

run:completed | run:failed | run:cancelled
run:finally
```

If `policy:pre` denies execution:

```txt
step:before
policy:pre
step:failed | step:cancelled | step:paused
step:finally
policy:finally
```

Rule:

> If `policy:pre` denies execution, `step:started` does not fire.

## 6.4 Hook rules

| Hook type       | Where defined                           | Who can define     |
| --------------- | --------------------------------------- | ------------------ |
| Extension hooks | `defineExtension(...).withHooks([...])` | Extension packages |
| Policy hooks    | `definePolicy(...).withHooks([...])`    | Policy packages    |
| Workflow hooks  | Not supported                           | N/A                |

## 6.5 Hook execution ordering

When multiple extension hooks listen to the same event:

```txt
1. Event name
2. Hook priority if provided
3. Extension binding order
```

When multiple policy hooks listen to the same policy event:

```txt
1. Policy event
2. Policy binding order
```

## 6.6 Policy decisions

Policy hooks may return:

```ts
export type PolicyDecision =
  | { type: "allow" }
  | { type: "deny"; reason: string; code?: string }
  | { type: "pause"; reason: string; approval?: unknown }
  | { type: "modify"; patch: unknown; reason?: string };
```

Combination rule:

| Decisions                           | Result                                |
| ----------------------------------- | ------------------------------------- |
| Any `deny`                          | Step fails/cancels before continuing. |
| Any `pause`                         | Step pauses.                          |
| One or more `modify`, no deny/pause | Apply modifications.                  |
| All allow/no decision               | Continue.                             |

`policy:finally` is not allowed to change the final step outcome. It is for cleanup, reconciliation, usage reporting, and audit finalization.

---

# 7. Runtime Execution Model

## 7.1 Runtime responsibilities

The environment/runtime owns:

| Responsibility              | Description                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| Registry resolution         | Resolve runtime, extensions, policies, capabilities by object or string ID. |
| Workflow validation         | Validate graph, refs, capabilities, schemas, runtime feature support.       |
| Lifecycle emission          | Emit run and step lifecycle events.                                         |
| Extension hooks             | Invoke extension hooks at lifecycle points.                                 |
| Policy hooks                | Invoke policy hooks at policy lifecycle points.                             |
| Capability execution        | Invoke capability handlers.                                                 |
| Retry execution             | Execute technical retries within policy constraints.                        |
| State commit                | Commit step output only when `.as()`/`commitAs` exists.                     |
| Run history                 | Store every step output regardless of commit.                               |
| Environment describe/search | Expose capabilities/policies/runtime features to agents/UIs.                |

## 7.2 State semantics

| Step output  | Behavior                                         |
| ------------ | ------------------------------------------------ |
| `.as("key")` | Commit output to `state[key]`.                   |
| No `.as()`   | Output stays in `run.steps[stepId].output` only. |

Commit modes:

```ts
type CommitMode = "create" | "replace" | "merge" | "append" | "version";
```

Default:

```txt
create
```

If key already exists and mode is `create`, validation or runtime should fail.

## 7.3 Refs

Workflow references use committed state.

```ts
ref("signals.results")
```

Serialized:

```json
{ "$ref": "state.signals.results" }
```

Optional ref:

```ts
ref("brandReview.feedback", { optional: true })
```

Serialized:

```json
{
  "$ref": "state.brandReview.feedback",
  "optional": true
}
```

---

# 8. Environment Model

## 8.1 Environment setup

```ts
const prod = environment("production", "Production Environment")
  .withRuntime(
    runtime("@executioncontrolprotocol/local", "Local Runtime").with({})
  )
  .withExtensions([
    extension("@executioncontrolprotocol/memory", "Business Knowledge Memory").with({
      hydrateModels: true,
      rememberOutputs: true,
      collections: ["leadership", "metrics", "decisions"],
      databaseUrl: env("MEMORY_DATABASE_URL"),
    }),
  ])
  .withPolicies([
    policy("@executioncontrolprotocol/budget", "Budget Guardrails").with({
      maxCostUsd: 2,
      maxModelCalls: 5,
      maxRetries: 2,
    }),
  ]);
```

If `.withRuntime(...)` is omitted, default to built-in local runtime:

```txt
@executioncontrolprotocol/local
```

## 8.2 Environment methods

```ts
interface Environment {
  compile(): EnvironmentManifest;
  validate(workflow?: WorkflowManifest): Promise<ValidationResult>;
  describe(query?: DescribeQuery): Promise<EnvironmentDescription>;
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
  run(workflow: WorkflowManifest, options?: RunOptions): Promise<RunHandle | RunResult>;
}
```

## 8.3 Environment descriptor query

Use a GraphQL-like plain object.

```ts
await env.describe({
  capabilities: {
    match: "slack",
    mode: "fuzzy",
    include: ["id", "label", "inputSchema", "outputSchema", "examples"],
    limit: 5,
  },
  policies: {
    match: "approval",
    mode: "partial",
    include: ["id", "label", "summary", "config"],
  },
});
```

Query type:

```ts
export interface DescribeQuery {
  runtime?: DescribeSelection;
  extensions?: DescribeSelection;
  capabilities?: DescribeSelection;
  policies?: DescribeSelection;
  features?: DescribeSelection;
}

export interface DescribeSelection {
  id?: string;
  namespace?: string;
  match?: string;
  mode?: "exact" | "partial" | "fuzzy" | "semantic";
  include?: string[];
  limit?: number;
}
```

## 8.4 Search

```ts
await env.search("send a message to Slack", {
  types: ["capability"],
  include: ["id", "label", "inputSchema", "examples"],
  limit: 5,
});
```

Search output:

```json
{
  "schema": "@executioncontrolprotocol.environment.search",
  "version": "1.0",
  "results": [
    {
      "type": "capability",
      "id": "@executioncontrolprotocol/slack.send",
      "label": "Send Slack Message",
      "score": 0.95,
      "reason": "Matches intent to send a message."
    }
  ]
}
```

---

# 9. Workflow Model

## 9.1 Workflow authoring

```ts
const weeklyBrief = workflow("Weekly leadership brief")
  .run([
    step("@executioncontrolprotocol/memory.search", "Collect Weekly Signals")
      .with({
        query: "important risks and decisions this week",
        since: "7d",
      })
      .as("signals"),

    step("@executioncontrolprotocol/openai.generate", "Generate Executive Brief")
      .with({
        prompt: "Create a concise leadership brief.",
        context: ref("signals.results"),
      })
      .as("brief"),

    step("@executioncontrolprotocol/slack.send", "Send Brief to Slack")
      .with({
        message: ref("brief.content"),
      }),
  ]);
```

## 9.2 Workflow methods

```ts
interface WorkflowBuilder {
  run(nodes: WorkflowBuilderNode[]): WorkflowBuilder;
  compile(): WorkflowManifest;
  validate(descriptor?: EnvironmentDescriptor): ValidationResult;
  toManifest(): WorkflowManifest;
  toGraph(): WorkflowGraph;
}
```

## 9.3 Workflow manifest

```json
{
  "schema": "@executioncontrolprotocol.workflow",
  "version": "1.0",
  "workflow": {
    "id": "weekly-leadership-brief",
    "label": "Weekly leadership brief"
  },
  "steps": [
    {
      "id": "collect-weekly-signals",
      "label": "Collect Weekly Signals",
      "uses": "@executioncontrolprotocol/memory.search",
      "input": {
        "query": "important risks and decisions this week",
        "since": "7d"
      },
      "commitAs": "signals"
    }
  ]
}
```

Workflow manifest must not include:

* runtime
* environment
* extension config
* policy config
* secrets
* `$env` refs in normal portable mode

---

# 10. Flow Control

## 10.1 Sequence

Arrays imply sequence.

```ts
workflow("Example").run([
  step("@executioncontrolprotocol/a.do", "A").with({}).as("a"),
  step("@executioncontrolprotocol/b.do", "B").with({ input: ref("a") }).as("b"),
]);
```

## 10.2 Parallel

```ts
parallel([
  step("@executioncontrolprotocol/openai.generate", "Generate Copy")
    .with({ prompt: "Write copy" })
    .as("copy"),

  step("@executioncontrolprotocol/firefly.generateImage", "Generate Image")
    .with({ prompt: "Create image" })
    .as("image"),
]);
```

Suggested manifest shape:

```json
{
  "type": "parallel",
  "id": "parallel-1",
  "branches": [
    [
      {
        "id": "generate-copy",
        "label": "Generate Copy",
        "uses": "@executioncontrolprotocol/openai.generate",
        "commitAs": "copy"
      }
    ],
    [
      {
        "id": "generate-image",
        "label": "Generate Image",
        "uses": "@executioncontrolprotocol/firefly.generateImage",
        "commitAs": "image"
      }
    ]
  ]
}
```

## 10.3 Branch

```ts
branch([
  step("@executioncontrolprotocol/slack.send", "Notify approval")
    .when(expr.eq("review.approved", true))
    .with({ message: "Approved" }),

  step("@executioncontrolprotocol/slack.send", "Notify rejection")
    .when(expr.eq("review.approved", false))
    .with({ message: "Rejected" }),
]);
```

## 10.4 Loop

```ts
loop(
  {
    label: "Generate and Validate Image",
    until: expr.eq("brandReview.approved", true),
    maxRounds: 3,
  },
  [
    step("@executioncontrolprotocol/firefly.generateImage", "Generate Image")
      .with({
        prompt: "Create a campaign hero image.",
        feedback: ref("brandReview.feedback", { optional: true }),
      })
      .as("image", { mode: "replace" }),

    step("@executioncontrolprotocol/openai.evaluate", "Validate Image")
      .with({
        artifact: ref("image"),
      })
      .as("brandReview", { mode: "replace" }),
  ]
);
```

Business loops belong in workflow logic. Technical retries belong to runtime/policy.

---

# 11. Definition Implementation Details

## 11.1 Runtime definition

```ts
const localRuntime = defineRuntime("@executioncontrolprotocol", "local")
  .withConfig({})
  .withExecutor(localExecutor);
```

Runtime executor interface:

```ts
export interface RuntimeExecutor {
  execute(
    manifest: WorkflowManifest,
    context: RuntimeExecutionContext
  ): Promise<RunResult | RunHandle>;
}
```

## 11.2 Extension definition

```ts
const memory = defineExtension("@executioncontrolprotocol", "memory")
  .withConfig({
    hydrateModels: boolean().default(true),
    rememberOutputs: boolean().default(false),
    collections: array(string()).default([]),
  })
  .withCapabilities([
    capability("search")
      .withInput(MemorySearchInput)
      .withOutput(MemorySearchOutput)
      .withHandler(searchMemory),
  ])
  .withHooks([
    hook("step:before", hydrateModelContext),
    hook("step:completed", rememberStepOutput),
    hook("run:finally", summarizeMemoryUsage),
  ]);
```

Extension hooks are allowed in extension definitions, not workflow definitions.

## 11.3 Capability handler

```ts
export type CapabilityHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  ctx: CapabilityContext
) => Promise<TOutput> | TOutput;
```

Capability context should expose mediated operations:

```ts
interface CapabilityContext {
  run: RunContext;
  step: StepExecutionContext;
  state: Record<string, unknown>;
  capabilities: {
    call(id: string, input: unknown): Promise<unknown>;
  };
  usage: UsageLedger;
  logger: Logger;
}
```

Important:

> Expensive, risky, external, or state-changing operations should go through runtime-mediated context handles where possible.

## 11.4 Hook handler

```ts
export type HookHandler = (
  ctx: LifecycleContext
) => Promise<void | unknown> | void | unknown;
```

Hook definition:

```ts
export interface HookDefinition {
  event: LifecycleEvent;
  handler: HookHandler;
  priority?: number;
  target?: string;
}
```

## 11.5 Policy hooks

```ts
const budget = definePolicy("@executioncontrolprotocol", "budget")
  .withConfig({
    maxCostUsd: number().optional(),
    maxModelCalls: number().optional(),
    maxRetries: number().optional(),
  })
  .withHooks([
    hook("policy:pre", reserveBudget),
    hook("policy:post", validateUsage),
    hook("policy:finally", finalizeUsageReport),
  ]);
```

---

# 12. Validation Specification

## 12.1 Workflow validation without environment

`workflow.validate()` checks:

| Check            | Description                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| Schema/version   | Valid `@executioncontrolprotocol.workflow`, supported version.           |
| Step IDs         | Unique generated or explicit IDs.                                        |
| Graph shape      | Valid sequence/parallel/branch/loop nodes.                               |
| Ref order        | A ref must point to prior committed state unless optional.               |
| Commit conflicts | Duplicate `commitAs` conflicts unless mode allows.                       |
| Loop config      | `maxRounds`, `until`, and body are valid.                                |
| Branch config    | Conditions are valid.                                                    |

## 12.2 Workflow validation with environment

`workflow.validate(environmentDescriptor)` or `environment.validate(workflowManifest)` additionally checks:

| Check                     | Description                                                      |
| ------------------------- | ---------------------------------------------------------------- |
| Capability availability   | Every `uses` exists in environment.                              |
| Input schema              | Step input matches capability input schema.                      |
| Output schema             | Commit type can be inferred from capability output.              |
| Runtime features          | Workflow uses only supported flow control.                       |
| Policy compatibility      | Active policies allow or can govern requested capabilities.      |
| Required extension config | Environment extension config is complete.                        |
| Approval requirements     | Side-effect-like capabilities may require approval per policies. |

## 12.3 Validation output

```json
{
  "schema": "@executioncontrolprotocol.validation.result",
  "version": "1.0",
  "valid": false,
  "errors": [
    {
      "code": "UNKNOWN_CAPABILITY",
      "message": "Capability @executioncontrolprotocol/slack.post is not registered.",
      "path": "steps[2].uses",
      "suggestions": ["@executioncontrolprotocol/slack.send"]
    }
  ],
  "warnings": []
}
```

---

# 13. MCP Specification

## 13.1 Package

```txt
@executioncontrolprotocol/mcp
```

Purpose:

> Expose a running ECP environment to agents through MCP tools, resources, and prompts.

## 13.2 Core API

```ts
createEcpMcpServer({ environment, name?, version? })
serveStdio({ environment })
serveHttp({ environment, port? })
```

## 13.3 MCP tools

Minimum v1 tools:

| Tool                       | Maps to                               |
| -------------------------- | ------------------------------------- |
| `ecp.describe_environment` | `environment.describe(query?)`        |
| `ecp.search`               | `environment.search(query, options?)` |
| `ecp.validate_workflow`    | `environment.validate(workflow)`      |
| `ecp.run_workflow`         | `environment.run(workflow, options?)` |
| `ecp.get_run_status`       | `run.status()`                        |

Later:

| Tool                 | Purpose                       |
| -------------------- | ----------------------------- |
| `ecp.get_run_events` | Read/stream lifecycle events. |
| `ecp.get_run_state`  | Return committed state.       |
| `ecp.cancel_run`     | Cancel a run.                 |
| `ecp.resume_run`     | Resume paused run.            |

## 13.4 MCP resources

| Resource               | URI                          |
| ---------------------- | ---------------------------- |
| Environment descriptor | `ecp://environment/describe` |
| Capabilities           | `ecp://capabilities`         |
| Capability detail      | `ecp://capabilities/{id}`    |
| Policies               | `ecp://policies`             |
| Run detail             | `ecp://runs/{runId}`         |
| Workflow examples      | `ecp://examples/workflows`   |

## 13.5 MCP prompts

| Prompt                    | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `ecp.author_workflow`     | Guide agent to build workflow manifest.  |
| `ecp.repair_workflow`     | Repair workflow using validation errors. |
| `ecp.explain_environment` | Explain available capabilities/policies. |

## 13.6 MCP implementation sketch

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function createEcpMcpServer({ environment }) {
  const server = new McpServer({
    name: "ecp",
    version: "1.0.0",
  });

  server.tool(
    "ecp.describe_environment",
    {
      query: z.any().optional(),
    },
    async ({ query }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await environment.describe(query), null, 2),
        },
      ],
    })
  );

  server.tool(
    "ecp.search",
    {
      query: z.string(),
      options: z.any().optional(),
    },
    async ({ query, options }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await environment.search(query, options), null, 2),
        },
      ],
    })
  );

  server.tool(
    "ecp.validate_workflow",
    {
      workflow: z.any(),
    },
    async ({ workflow }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await environment.validate(workflow), null, 2),
        },
      ],
    })
  );

  server.tool(
    "ecp.run_workflow",
    {
      workflow: z.any(),
      input: z.any().optional(),
      dryRun: z.boolean().optional(),
    },
    async ({ workflow, input, dryRun }) => {
      if (dryRun) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await environment.validate(workflow), null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(await environment.run(workflow, { input }), null, 2),
          },
        ],
      };
    }
  );

  return server;
}
```

Security rules:

* MCP tools must call only environment APIs.
* MCP must not bypass policy/runtime.
* `run_workflow` should validate before execution.
* `describe()` must not expose secrets.
* Side-effect execution is governed by environment policies.

---

# 14. CLI Specification

Package:

```txt
@executioncontrolprotocol/cli
```

Commands:

```bash
ecp compile workflow.ts
ecp validate workflow.json --env environment.ts
ecp describe --env environment.ts
ecp search "send message" --env environment.ts
ecp run workflow.json --env environment.ts --input input.json
ecp mcp serve --env environment.ts --transport stdio
ecp mcp serve --env environment.ts --transport http --port 8787
```

CLI should use `@executioncontrolprotocol/core` and optional packages as needed.

---

# 15. Standard Policies

Package:

```txt
@executioncontrolprotocol/policies
```

## 15.1 Budget policy

ID:

```txt
@executioncontrolprotocol/budget
```

Config:

```ts
{
  maxCostUsd?: number;
  maxModelCalls?: number;
  maxRetries?: number;
  maxTokens?: number;
}
```

Hooks:

| Hook             | Behavior                                        |
| ---------------- | ----------------------------------------------- |
| `policy:pre`     | Reserve budget / check remaining budget.        |
| `policy:post`    | Validate actual usage.                          |
| `policy:finally` | Finalize usage report and release reservations. |

## 15.2 Approval policy

ID:

```txt
@executioncontrolprotocol/approval
```

Config:

```ts
{
  requireApprovalFor: string[];
}
```

Hooks:

| Hook             | Behavior                                        |
| ---------------- | ----------------------------------------------- |
| `policy:pre`     | Return `pause` if capability requires approval. |
| `policy:finally` | Record approval state.                          |

---

# 16. First-Party Extensions

## 16.1 Memory extension

Package:

```txt
@executioncontrolprotocol/extension-memory
```

ID:

```txt
@executioncontrolprotocol/memory
```

Capabilities:

```txt
@executioncontrolprotocol/memory.search
@executioncontrolprotocol/memory.remember
```

Hooks:

| Hook             | Behavior                              |
| ---------------- | ------------------------------------- |
| `step:before`    | Hydrate model inputs when configured. |
| `step:completed` | Remember outputs when configured.     |
| `run:finally`    | Summarize memory usage.               |

Config:

```ts
{
  hydrateModels?: boolean;
  rememberOutputs?: boolean;
  collections?: string[];
  databaseUrl?: string;
}
```

## 16.2 OpenAI extension

Package:

```txt
@executioncontrolprotocol/extension-openai
```

ID:

```txt
@executioncontrolprotocol/openai
```

Capabilities:

```txt
@executioncontrolprotocol/openai.generate
@executioncontrolprotocol/openai.evaluate
```

Config:

```ts
{
  apiKey?: string;
  defaultModel?: string;
}
```

## 16.3 Slack extension

Package:

```txt
@executioncontrolprotocol/extension-slack
```

ID:

```txt
@executioncontrolprotocol/slack
```

Capabilities:

```txt
@executioncontrolprotocol/slack.send
```

Config:

```ts
{
  botToken?: string;
  defaultChannel?: string;
}
```

## 16.4 Telemetry extension

Package:

```txt
@executioncontrolprotocol/extension-telemetry
```

Hooks:

| Hook             | Behavior             |
| ---------------- | -------------------- |
| `run:started`    | Record run start.    |
| `step:completed` | Record step success. |
| `step:failed`    | Record step failure. |
| `run:finally`    | Flush telemetry.     |

---

# 17. Temporal Runtime

Package:

```txt
@executioncontrolprotocol/runtime-temporal
```

Export:

```ts
temporalRuntime
```

Usage:

```ts
environment("production")
  .withRuntime(
    runtime(temporalRuntime, "Temporal Runtime").with({
      taskQueue: "ecp-runtime",
      durablePauses: true,
    })
  );
```

Responsibilities:

| Responsibility        | Temporal behavior                                          |
| --------------------- | ---------------------------------------------------------- |
| Durable orchestration | Temporal workflow interpreter.                             |
| Step execution        | Activities.                                                |
| Parallel              | Promise-based activity scheduling.                         |
| Loops/branches        | Deterministic workflow logic.                              |
| Pause/resume          | Signals/updates.                                           |
| Technical retries     | Activity retries, constrained by ECP policies.             |
| State                 | Rebuilt through replay; large artifacts stored externally. |

---

# 18. Implementation Milestones

## Phase 1: Types and core builders

Implement:

* `@executioncontrolprotocol/types`
* `@executioncontrolprotocol/core`
* workflow builder
* step builder
* ref/env helpers
* definition builders
* binding builders
* manifest serialization
* schema/version constants

Acceptance:

```ts
workflow("Test")
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("echo"),
  ])
  .toManifest();
```

Produces valid `@executioncontrolprotocol.workflow` manifest.

## Phase 2: Environment and local runtime

Implement:

* `environment(...)`
* registry
* local runtime
* lifecycle engine
* capability execution
* extension hooks
* policy hooks
* state commit
* run history

Acceptance:

* Register test extension with `echo` capability.
* Run workflow locally.
* State contains committed output.
* Uncommitted output exists only in run history.

## Phase 3: Validation and describe

Implement:

* workflow validation
* environment validation
* descriptor generation
* object query support
* search support

Acceptance:

* `env.describe({ capabilities: { match: "echo" } })`
* `env.validate(workflowManifest)` catches unknown capabilities and invalid inputs.

## Phase 4: Policies

Implement:

* policy engine
* budget policy
* approval policy
* retry constraints
* `policy:finally` usage reporting

Acceptance:

* Budget policy prevents execution above max model calls/retries.
* Approval policy pauses configured capability.

## Phase 5: MCP

Implement:

* `@executioncontrolprotocol/mcp`
* tools: describe, search, validate, run, status
* resources
* prompts

Acceptance:

* MCP server exposes environment.
* Agent can call describe, validate, run.

## Phase 6: First-party extensions

Implement:

* memory extension
* OpenAI extension
* Slack extension
* telemetry extension
* storage extension as needed

## Phase 7: Temporal runtime

Implement:

* Temporal runtime adapter
* workflow interpreter
* activity dispatcher
* pause/resume handling
* policy-constrained retries

---

# 19. Non-goals for v1

Do not implement in v1:

* Arbitrary workflow-authored hooks
* Public capability lifecycle hooks
* Public state hooks
* Public retry lifecycle hooks
* Serialized arbitrary JavaScript execution
* Full GraphQL parser dependency for `describe()`
* Heavy all-in-one default extension bundle
* Workflow manifests that embed environment/runtime/policy config

---

# 20. Final Source-of-Truth Rules

| Area              | Rule                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| Workflow manifest | Portable, environment-free execution graph.                                         |
| Environment       | Running container with runtime/extensions/policies/secrets.                         |
| Runtime           | Executes workflow and emits lifecycle.                                              |
| Extensions        | Provide capabilities and/or lifecycle hooks.                                        |
| Policies          | Govern execution with `policy:pre`, `policy:post`, `policy:finally`.                |
| Capabilities      | Step-callable units with input/output/handler.                                      |
| Steps             | `step(ref, label?).with(input).as(key?)`.                                           |
| State             | `.as()` commits output. No `.as()` means run history only.                          |
| Refs              | `ref()` reads workflow state.                                                       |
| Env               | `env()` resolves environment config, not workflow state.                            |
| Describe          | Agent/UI discovery API for running environments.                                    |
| Search            | Agent-friendly fuzzy/semantic discovery.                                            |
| MCP               | Agent-facing access layer over environment APIs.                                    |
| Packages          | Core local engine in `@executioncontrolprotocol/core`; heavy integrations optional. |

This specification should be implementable directly by coding agents.

Yes. The implementation plan is still strong, but it needs a focused update to the **state/store model**, **refs**, **capability context**, **policy context**, and **runtime commit phase**.

Below are the edits I would merge into the implementation spec.

---

# Implementation plan updates: `state()` and policy-validated mutations

## 1. Add `state()` as a core helper

Add `state(path, options?)` alongside `ref()` and `env()`.

```ts
ref("creativeInputs")   // read-only state reference
state("creativeInputs") // mutable state handle
env("OPENAI_API_KEY")   // environment setup reference
```

## Updated helper table

| Helper        | Scope                  | Purpose                                           | Serialized form            |
| ------------- | ---------------------- | ------------------------------------------------- | -------------------------- |
| `ref(path)`   | Workflow manifest      | Read committed workflow state.                    | `{ "$ref": "state.path" }` |
| `state(path)` | Workflow manifest      | Pass a controlled mutable state handle to a step. | `{ "$state": "path" }`     |
| `env(name)`   | Environment setup only | Resolve environment config/secrets.               | `{ "$env": "NAME" }`       |

## Type addition

```ts
export interface StateValue {
  $state: string;
  optional?: boolean;
  fallback?: unknown;
}
```

Update common value types:

```ts
export type InputValue =
  | string
  | number
  | boolean
  | null
  | InputValue[]
  | { [key: string]: InputValue }
  | RefValue
  | StateValue
  | EnvValue;
```

Workflow manifests may contain `$state`. Environment manifests may contain `$env`.

---

# 2. Update workflow authoring examples

Replace `mutableRef(...)` with `state(...)`.

```ts
step("@executioncontrolprotocol/creative.fixInputs", "Fix Creative Inputs")
  .when(expr.eq("brandReview.approved", false))
  .with({
    target: state("creativeInputs"),
    currentInputs: ref("creativeInputs"),
    review: ref("brandReview"),
    image: ref("image"),
    brandStandards: ref("brandStandards.results"),
  })
  .as("fix", { mode: "replace" });
```

Inside the capability:

```ts
await ctx.store.merge(input.target, {
  generationPrompt: fix.generationPrompt,
  generationControls: fix.generationControls,
}, {
  reason: fix.rationale,
});

return fix;
```

`.as("fix")` still commits the returned output.
`ctx.store.merge(input.target, ...)` requests a staged mutation against `creativeInputs`.

---

# 3. Update capability handler contract

The capability return contract stays simple.

## Keep

```ts
export type CapabilityHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  ctx: CapabilityContext
) => Promise<TOutput> | TOutput;
```

## Do not introduce

```ts
{
  output,
  actions
}
```

Capabilities return plain outputs. Store mutations happen through `ctx.store`.

---

# 4. Add store handles to resolved step input

When runtime resolves step input:

```json
{
  "target": {
    "$state": "creativeInputs"
  },
  "currentInputs": {
    "$ref": "state.creativeInputs"
  }
}
```

The capability should receive:

```ts
{
  target: StoreStateHandle;
  currentInputs: {
    generationPrompt: "...",
    generationControls: {}
  }
}
```

## New type

```ts
export interface StoreStateHandle<T = unknown> {
  kind: "state";
  path: string;
  mutable: true;
}
```

Important:

> `state()` resolves to a handle, not the raw value.
> `ref()` resolves to the raw committed value.

---

# 5. Add `ctx.store` to capability context

Add a transactional store API to `CapabilityContext`.

```ts
export interface CapabilityContext {
  store: StoreContext;
  state: Readonly<Record<string, unknown>>;
  run: RunContext;
  step: StepContext;
  logger: Logger;
  usage: UsageLedger;
}
```

## Store API

```ts
export interface StoreContext {
  read<T = unknown>(
    handleOrPath: StoreStateHandle<T> | string,
    options?: StoreReadOptions
  ): Promise<T>;

  set<T = unknown>(
    handle: StoreStateHandle<T>,
    value: T,
    options?: StoreWriteOptions
  ): Promise<PendingMutation>;

  replace<T = unknown>(
    handle: StoreStateHandle<T>,
    value: T,
    options?: StoreWriteOptions
  ): Promise<PendingMutation>;

  merge<T extends Record<string, unknown>>(
    handle: StoreStateHandle<T>,
    value: Partial<T>,
    options?: StoreWriteOptions
  ): Promise<PendingMutation>;

  append<T = unknown>(
    handle: StoreStateHandle<T[]>,
    value: T,
    options?: StoreWriteOptions
  ): Promise<PendingMutation>;
}

export interface StoreReadOptions {
  includePending?: boolean;
}

export interface StoreWriteOptions {
  reason?: string;
  metadata?: Record<string, unknown>;
}
```

Write methods should require a `StoreStateHandle`, not a raw string path.

This prevents uncontrolled mutation.

---

# 6. Add staged mutation records

Store calls during capability execution do not immediately commit.

They create pending mutations.

```ts
export interface PendingMutation {
  id: string;
  op: "set" | "replace" | "merge" | "append";
  path: string;
  value: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  status: "pending";
}
```

Committed mutation record:

```ts
export interface MutationRecord {
  id: string;
  op: "set" | "replace" | "merge" | "append";
  path: string;
  before: unknown;
  after: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  status: "committed" | "denied" | "discarded" | "failed";
  stepId: string;
  capability: string;
  timestamp: string;
}
```

Add to run history:

```ts
export interface StepRunRecord {
  status: RunStatus;
  output?: unknown;
  committedAs?: string | null;
  attempts?: number;
  usage?: Record<string, unknown>;
  mutations?: MutationRecord[];
}
```

---

# 7. Update lifecycle wording, but do not add new hooks

No new public lifecycle hooks.

Update the lifecycle explanation to include staged mutations inside `step:started` and commit after `policy:post`.

```txt
step:before
  resolve ref() values
  resolve state() handles

policy:pre
  validate step execution and mutable state handles

step:started
  execute capability
  capability may call ctx.store.*
  store calls create staged pending mutations
  capability returns plain output

policy:post
  validate returned output
  validate pending mutations
  allow / deny / modify / pause

runtime commit transaction
  commit approved staged mutations
  commit returned output to .as() if present
  record mutation history

step:completed | step:failed | step:paused | step:cancelled

step:finally
policy:finally
  usage reporting, mutation audit, cleanup
```

Update source-of-truth rule:

> `state()` does not introduce new lifecycle hooks. Store mutations are staged during capability execution, exposed to `policy:post`, and committed transactionally by the runtime.

---

# 8. Update policy context

Policies must be able to inspect:

* resolved step input
* which inputs are mutable state handles
* returned output
* pending mutations
* proposed final state after mutations

## Add to policy context

```ts
export interface PolicyContext {
  workflow: WorkflowManifest;
  run: RunContext;
  step: StepExecutionContext;
  state: Record<string, unknown>;
  input: Record<string, unknown>;
  output?: unknown;
  mutableStateHandles?: StoreStateHandle[];
  pendingMutations?: PendingMutation[];
  proposedState?: Record<string, unknown>;
  usage: UsageLedger;
}
```

## Policy usage

At `policy:pre`, policies can check:

```ts
mutableStateHandles
```

At `policy:post`, policies can check:

```ts
output
pendingMutations
proposedState
```

At `policy:finally`, policies can report:

```ts
committed mutations
denied/discarded mutations
usage
audit
```

---

# 9. Add state-control policy to standard policies

Add a first-party policy to `@executioncontrolprotocol/policies`.

## ID

```txt
@executioncontrolprotocol/state-control
```

## Config

```ts
export interface StateControlPolicyConfig {
  allowedMutablePaths?: string[];
  deniedMutablePaths?: string[];
  allowedMutationOps?: Array<"set" | "replace" | "merge" | "append">;
  requireReason?: boolean;
  maxMutationsPerStep?: number;
  maxMutationPayloadKb?: number;
}
```

## Behavior

| Hook             | Behavior                                              |
| ---------------- | ----------------------------------------------------- |
| `policy:pre`     | Validate that provided `state()` handles are allowed. |
| `policy:post`    | Validate pending mutations and proposed state.        |
| `policy:finally` | Record mutation audit/summary.                        |

Default behavior:

* If no state-control policy exists, runtime should still reject writes that do not use `state()` handles.
* Strict environments can require `@executioncontrolprotocol/state-control` when any step uses `$state`.

Recommended validation warning:

```txt
Workflow uses state() handles but environment has no @executioncontrolprotocol/state-control policy.
```

---

# 10. Update validation rules

## Workflow validation

Add checks:

| Check                     | Rule                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `$state` syntax           | Must reference a valid state path string.                                                         |
| `$state` location         | Allowed in step `.with(...)` input.                                                               |
| `$state` conflict         | A step should not `.as()` to the same root path it mutates unless explicitly allowed.             |
| Ref order                 | `ref()` must point to committed prior state unless optional.                                      |
| State handle availability | `state()` path may be created by a prior step, initial input, or optional/fallback configuration. |

## Environment validation

Add checks:

| Check                  | Rule                                                       |
| ---------------------- | ---------------------------------------------------------- |
| State mutation support | Runtime must support staged mutations.                     |
| Policy availability    | State mutation policies should be present for strict mode. |
| Capability schemas     | Input schema should allow state handles where used.        |
| Mutable path policy    | `state()` paths must be allowed by active policies.        |

---

# 11. Update manifest examples

## Workflow manifest with `$state`

```json
{
  "schema": "@executioncontrolprotocol.workflow",
  "version": "1.0",
  "workflow": {
    "id": "brand-image-refinement",
    "label": "Brand image refinement"
  },
  "steps": [
    {
      "id": "fix-creative-inputs",
      "label": "Fix Creative Inputs",
      "uses": "@executioncontrolprotocol/creative.fixInputs",
      "input": {
        "target": {
          "$state": "creativeInputs"
        },
        "currentInputs": {
          "$ref": "state.creativeInputs"
        },
        "review": {
          "$ref": "state.brandReview"
        },
        "image": {
          "$ref": "state.image"
        },
        "brandStandards": {
          "$ref": "state.brandStandards.results"
        }
      },
      "commitAs": "fix",
      "commitMode": "replace"
    }
  ]
}
```

---

# 12. Update examples: refinement loop

Use `state()` for mutable handles.

```ts
const brandImageWorkflow = workflow("Brand image refinement")
  .run([
    step("@executioncontrolprotocol/memory.search", "Load Brand Standards")
      .with({
        query: "brand standards, visual identity, approved campaign examples",
      })
      .as("brandStandards"),

    step("@executioncontrolprotocol/creative.initializeInputs", "Initialize Creative Inputs")
      .with({
        target: state("creativeInputs"),
        value: {
          generationPrompt: "Create a premium campaign hero image.",
          generationControls: {
            aspectRatio: "16:9",
            style: "premium lifestyle photography",
          },
        },
      }),

    loop(
      {
        label: "Create, Validate, and Fix",
        until: expr.eq("brandReview.approved", true),
        maxRounds: 3,
      },
      [
        step("@executioncontrolprotocol/firefly.generateImage", "Create Image")
          .with({
            prompt: ref("creativeInputs.generationPrompt"),
            controls: ref("creativeInputs.generationControls"),
            brandContext: ref("brandStandards.results"),
          })
          .as("image", { mode: "replace" }),

        step("@executioncontrolprotocol/openai.evaluate", "Validate Image")
          .with({
            artifact: ref("image"),
            criteria: ref("brandStandards.results"),
            goal: "Evaluate whether the image follows brand standards.",
          })
          .as("brandReview", { mode: "replace" }),

        step("@executioncontrolprotocol/creative.fixInputs", "Fix Creative Inputs")
          .when(expr.eq("brandReview.approved", false))
          .with({
            target: state("creativeInputs"),
            currentInputs: ref("creativeInputs"),
            review: ref("brandReview"),
            image: ref("image"),
            brandStandards: ref("brandStandards.results"),
          })
          .as("fix", { mode: "replace" }),
      ]
    ),
  ]);
```

---

# 13. Update capability example

```ts
const creative = defineExtension("@executioncontrolprotocol", "creative")
  .withCapabilities([
    capability("initializeInputs")
      .withInput(InitializeInputsInput)
      .withOutput(InitializeInputsOutput)
      .withHandler(async (input, ctx) => {
        await ctx.store.set(input.target, input.value, {
          reason: "Initialize creative generation inputs",
        });

        return {
          initialized: true,
        };
      }),

    capability("fixInputs")
      .withInput(FixInputsInput)
      .withOutput(FixInputsOutput)
      .withHandler(async (input, ctx) => {
        const fix = await ctx.models.generateStructured({
          prompt: "Improve creative inputs based on validation feedback.",
          input: {
            currentInputs: input.currentInputs,
            review: input.review,
            image: input.image,
            brandStandards: input.brandStandards,
          },
          schema: FixInputsOutput,
        });

        await ctx.store.merge(
          input.target,
          {
            generationPrompt: fix.generationPrompt,
            generationControls: fix.generationControls,
          },
          {
            reason: fix.rationale,
          }
        );

        return fix;
      }),
  ]);
```

---

# 14. Update runtime commit algorithm

Replace previous action/result-envelope logic with this.

```ts
async function executeStep(step, ctx) {
  const resolvedInput = resolveStepInput(step.input, ctx.state);
  const mutableStateHandles = collectStateHandles(resolvedInput);

  await lifecycle.emit("step:before", ctx);

  const preDecision = await policies.evaluate("policy:pre", {
    ...ctx,
    input: resolvedInput,
    mutableStateHandles,
  });

  if (!preDecision.allowed) {
    return handlePolicyBlock(preDecision);
  }

  const mutationBuffer = createMutationBuffer();

  const capabilityCtx = createCapabilityContext({
    ...ctx,
    store: createTransactionalStore({
      state: ctx.state,
      mutationBuffer,
      allowedHandles: mutableStateHandles,
    }),
  });

  await lifecycle.emit("step:started", ctx);

  let output;
  try {
    output = await capability.handler(resolvedInput, capabilityCtx);
  } catch (error) {
    mutationBuffer.discard();
    return failStep(error);
  }

  const proposedState = mutationBuffer.preview(ctx.state);

  const postDecision = await policies.evaluate("policy:post", {
    ...ctx,
    input: resolvedInput,
    output,
    pendingMutations: mutationBuffer.pending(),
    proposedState,
  });

  if (!postDecision.allowed) {
    mutationBuffer.deny(postDecision.reason);
    return failOrPauseStep(postDecision);
  }

  await commitTransaction({
    state: ctx.state,
    mutations: mutationBuffer.pending(),
    output,
    commitAs: step.commitAs,
    commitMode: step.commitMode,
  });

  await lifecycle.emit("step:completed", ctx);

  await lifecycle.emit("step:finally", ctx);
  await policies.evaluate("policy:finally", ctx);
}
```

Important transaction rule:

> Staged mutations and `.as()` output commit together. If the step fails or policy denies, neither is committed.

---

# 15. Update source-of-truth rules

Add these to the implementation spec:

| Rule                   | Decision                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- |
| Read state             | Use `ref(path)`.                                                              |
| Mutable state handle   | Use `state(path)`.                                                            |
| Capability output      | Capabilities return plain output.                                             |
| Output commit          | `.as(key)` maps returned output to state.                                     |
| Store mutation         | Capabilities request mutations through `ctx.store`.                           |
| Store write target     | Store writes require a `state()` handle passed as step input.                 |
| Mutation timing        | Store mutations are staged until `policy:post`.                               |
| Mutation governance    | Policies inspect and approve/deny pending mutations before commit.            |
| Transactionality       | Staged mutations and `.as()` output commit together.                          |
| No new lifecycle hooks | Store mutation events are runtime/audit metadata, not public lifecycle hooks. |

---

# 16. What does not change

These parts of the implementation plan remain unchanged:

| Area                          | Status                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Package architecture          | No change.                                                                           |
| Workflow manifest portability | No change.                                                                           |
| Environment/runtime split     | No change.                                                                           |
| MCP adapter                   | No change, but describe should include `$state` support in capability input schemas. |
| Lifecycle public hooks        | No new public hooks.                                                                 |
| Policy hooks                  | Still `policy:pre`, `policy:post`, `policy:finally`.                                 |
| `.as()` behavior              | Still maps returned output to state.                                                 |
| Extension definitions         | Still `.withConfig()`, `.withCapabilities()`, `.withHooks()`.                        |

---

# Short merge note

Replace the previous “store action return envelope” idea with:

> Capabilities return plain outputs. Capabilities can request state mutations through `ctx.store`, but store write methods require handles created by `state()` in step input. Mutations are staged, exposed to policies, then committed transactionally with `.as()` output after `policy:post`.

That is the clean version to merge.
