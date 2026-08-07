> **Verification (validation sprint):** see [ecp-assessment-verification.md](ecp-assessment-verification.md).

I found the recent implementation report here:

I’m comparing three sources:

1. **Implementation report**: what agents say was built. 
2. **Core ECP source-of-truth spec**: the implementation plan we defined earlier. 
3. **Auto Fixes / `state()` update**: the later refinement around mutable state handles and staged mutations. 

I did not inspect the actual repository code directly here, so this is a comparison against the implementation report, not a code audit.

---

# Executive summary

Overall: **the implementation appears highly aligned with the spec**, especially for the core architecture.

The agents seem to have implemented the main foundation correctly:

| Area                                  | Status                                       |
| ------------------------------------- | -------------------------------------------- |
| Fluent API shape                      | Strongly aligned                             |
| Package taxonomy                      | Mostly aligned                               |
| Environment/runtime/workflow split    | Strongly aligned                             |
| Portable workflow manifests           | Aligned                                      |
| Local runtime                         | Implemented                                  |
| `state()` mutable handle              | Implemented                                  |
| Transactional store pieces            | Reported as implemented                      |
| Lifecycle model                       | Mostly aligned                               |
| CLI basics                            | Partially aligned                            |
| MCP                                   | Package exists, but incomplete vs our target |
| Temporal                              | Not implemented; stub only                   |
| Storage extension                     | Stub only                                    |
| Semantic search                       | Not implemented                              |
| JSON Schema artifacts in `@executioncontrolprotocol/types` | Not implemented                              |

The biggest gaps are:

1. **MCP is not fully productized yet**: no `ecp mcp serve` CLI, HTTP is only a placeholder, and resources/prompts are not confirmed.
2. **Describe/search are basic**: substring search only, not rich fuzzy/semantic discovery.
3. **`@executioncontrolprotocol/types` is TS-only**: no JSON Schema artifacts or generated schema dist yet.
4. **Temporal runtime is only a stub**.
5. **Storage capabilities are empty stubs**.
6. **The late `state()` mutation model may be partially implemented but should be verified carefully**, because the implementation report says store types and transaction helpers exist, but we need confirm policy contexts and state-control policy behavior.

---

# 1. Core architecture comparison

## What we defined

We defined a clean split:

| Layer                   | Responsibility                                                             |
| ----------------------- | -------------------------------------------------------------------------- |
| `@executioncontrolprotocol/types`            | Protocol types and schema constants                                        |
| `@executioncontrolprotocol/core`             | Fluent API, definitions, environment, local runtime, validation, lifecycle |
| `@executioncontrolprotocol/mcp`              | Agent-facing MCP adapter                                                   |
| `@executioncontrolprotocol/cli`              | Compile, validate, describe, search, run, MCP serve                        |
| `@executioncontrolprotocol/policies`         | Standard policies                                                          |
| `@executioncontrolprotocol/runtime-temporal` | Optional durable runtime                                                   |
| `@executioncontrolprotocol/extension-*`      | Optional first-party extensions                                            |

The source spec explicitly says `@executioncontrolprotocol/core` should include the fluent API, definitions, environment, registry, local runtime, lifecycle engine, validation, and local execution. 

## What was implemented

The report says those layers are present: definitions, bindings, value helpers, flow control, environment, portable workflow manifests, local execution, TS/JS compilation, basic describe/search, MCP package, and CLI commands are all listed. 

## Assessment

**Strong alignment.** The foundation is right.

The implemented architecture follows the key rule we defined:

> Workflow manifests do not contain runtime config, extension config, policies, or secrets. Environments execute workflows.

The implementation report repeats this rule explicitly. 

---

# 2. Fluent API comparison

## What we defined

Canonical API:

```ts
workflow(label)
  .run([...])

environment(id, label?)
  .withRuntime(...)
  .withExtensions([...])
  .withPolicies([...])

step(ref, label?)
  .with(input)
  .as(key?, options?)
```

Definitions:

```ts
defineRuntime(namespace, name)
  .withConfig(...)
  .withExecutor(...)

defineExtension(namespace, name)
  .withConfig(...)
  .withCapabilities([...])
  .withHooks([...])

definePolicy(namespace, name)
  .withConfig(...)
  .withHooks([...])

capability(name)
  .withInput(...)
  .withOutput(...)
  .withHandler(...)
```

## What was implemented

The implementation report lists the expected public factories: `workflow`, `step`, `extension`, `runtime`, `policy`, `environment`, `defineExtension`, `defineRuntime`, `definePolicy`, `capability`, `hook`, `parallel`, `branch`, `loop`, `ref`, `state`, `env`, and `expr`. 

It also confirms `StepBuilder` has `.with()`, `.when()`, `.as()`, `.id()`, and `.toNode()`, which matches our direction. 

## Assessment

**Very strong alignment.**

One notable implementation addition:

| Implemented item                   | Assessment                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `capabilityFor(extensionId, name)` | Not in our final minimal spec, but useful. It solves scoped capability generation cleanly. I would keep it if it does not complicate authoring. |

Potential minor inconsistency:

| Area                                                                                                         | Concern                                                              |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `RuntimeDefinitionBuilder.withExecutor()` returns definition directly, while extension/policy use `.build()` | Acceptable, but inconsistent. Could standardize later if DX matters. |

---

# 3. Workflow manifest portability

## What we defined

Workflow JSON should contain only execution graph:

```json
{
  "schema": "@executioncontrolprotocol.workflow",
  "version": "1.0",
  "workflow": {},
  "steps": []
}
```

No runtime, environment, extension config, policy config, or secrets.

## What was implemented

The implementation report states workflow manifests are portable `@executioncontrolprotocol.workflow` JSON and repeats that workflow manifests do not contain runtime config, extension config, policies, or secrets. 

## Assessment

**Aligned.**

No required changes here.

---

# 4. Package architecture comparison

## What we defined

Final package architecture:

| Package                 | Intent                                |
| ----------------------- | ------------------------------------- |
| `@executioncontrolprotocol/types`            | Types, schema constants, JSON schemas |
| `@executioncontrolprotocol/core`             | Full local ECP engine                 |
| `@executioncontrolprotocol/mcp`              | MCP adapter                           |
| `@executioncontrolprotocol/cli`              | CLI                                   |
| `@executioncontrolprotocol/policies`         | Standard policies                     |
| `@executioncontrolprotocol/runtime-temporal` | Optional Temporal runtime             |
| `@executioncontrolprotocol/extension-*`      | Optional extensions                   |
| `@executioncontrolprotocol/extensions`       | Convenience bundle                    |

## What was implemented

The report lists package inventory including extensions for memory, OpenAI, Ollama, Slack, storage, telemetry, and an `@executioncontrolprotocol/extensions` bundle. It also lists `@executioncontrolprotocol/mcp` and `@executioncontrolprotocol/cli`. 

## Assessment

**Mostly aligned.**

Notable differences:

| Difference                             | Assessment                                                     |
| -------------------------------------- | -------------------------------------------------------------- |
| `@executioncontrolprotocol/extension-ollama` implemented    | Good addition. It supports the local/hybrid model strategy.    |
| `@executioncontrolprotocol/storage` capabilities empty stub | Needs implementation if storage is part of near-term examples. |
| `@executioncontrolprotocol/runtime-temporal` stub only      | Expected if deferred, but still a major roadmap gap.           |

---

# 5. Lifecycle comparison

## What we defined

Public lifecycle remains:

```txt
run:before
run:started

for each step:
  step:before
  policy:pre
  step:started
  execute capability
  policy:post
  step:completed | step:failed | step:cancelled | step:paused
  step:finally
  policy:finally

run:completed | run:failed | run:cancelled
run:finally
```

No public lifecycle hooks for capability, state, model/tool subcalls, or retry. The source spec says the public lifecycle only includes run, step, and policy, and explicitly excludes public capability/state/retry/subcall lifecycle hooks. 

## What was implemented

The report lists lifecycle types including `RunLifecycleEvent`, `StepLifecycleEvent`, `PolicyLifecycleEvent`, and `LifecycleEvent`, plus `PolicyDecision` variants of allow, deny, pause, and modify. 

The runtime internals include `emitLifecycle`, `evaluatePolicies`, and `combinePolicyDecisions`. 

## Assessment

**Likely aligned.**

Needs code verification for ordering:

| Required behavior                                   | Need to verify                                       |
| --------------------------------------------------- | ---------------------------------------------------- |
| `step:started` does not fire if `policy:pre` denies | Not proven by report                                 |
| `policy:post` runs before output commit             | Implied by transaction helpers, but should be tested |
| `policy:finally` runs even on failure/pause/cancel  | Not proven by report                                 |
| `step:finally` always runs                          | Not proven by report                                 |

Recommended tests:

```txt
policy:pre deny → no step:started, no capability call
capability throws → step:failed, step:finally, policy:finally
policy:post deny → no .as commit, no mutation commit
pause decision → step:paused, no capability if pre-pause
```

---

# 6. `state()` and store mutation model comparison

This is the most important recent refinement.

## What we defined

We updated the plan to:

| Rule                 | Decision                                       |
| -------------------- | ---------------------------------------------- |
| Read state           | `ref(path)`                                    |
| Mutable state handle | `state(path)`                                  |
| Capability return    | Plain output                                   |
| Output commit        | `.as(key)` maps returned output to state       |
| Store mutation       | Capabilities use `ctx.store`                   |
| Store write target   | Write methods require a `state()` handle       |
| Mutation timing      | Store mutations are staged until `policy:post` |
| Mutation governance  | Policies inspect/approve pending mutations     |
| Transactionality     | Mutations and `.as()` output commit together   |
| Lifecycle            | No new public state hooks                      |

The Auto Fixes spec explicitly says store calls create pending mutations, policy validates them, and staged mutations plus `.as()` output commit together transactionally after `policy:post`. 

## What was implemented

The implementation report says:

* `state<T>(path, options?)` exists and returns a mutable state handle. 
* `PendingMutation`, `MutationRecord`, and `StoreStateHandle` are present in `@executioncontrolprotocol/types`. 
* Runtime internals include `resolveStepInput`, `commitTransaction`, `createTransactionalStore`, `createMutationBuffer`, and `collectStateHandles`. 

## Assessment

**The implementation appears directionally aligned, but this area needs the most careful audit.**

The report confirms the right objects exist. It does not fully prove the behavior is implemented exactly as we intended.

### Must-verify behavior

| Required behavior                                                                        | Why it matters                          |
| ---------------------------------------------------------------------------------------- | --------------------------------------- |
| `ctx.store.set/merge/append/replace` require a `StoreStateHandle`, not a raw string path | Prevents uncontrolled state writes      |
| Store writes are staged, not committed immediately                                       | Preserves policy/post-commit semantics  |
| `policy:post` receives `pendingMutations` and `proposedState`                            | Allows policy to validate state changes |
| Failed step discards pending mutations                                                   | Prevents partial side effects           |
| `policy:post` denial prevents both mutation commit and `.as()` commit                    | Ensures transactionality                |
| `.as()` to same root as a pending mutation is rejected unless explicitly allowed         | Prevents inconsistent state writes      |
| Step run history records mutation records                                                | Needed for audit/debugging              |

### Likely gap

The implementation report mentions `PendingMutation`, `MutationRecord`, and mutation helpers, but the original Core spec file it was aligned to may not include the latest `state()` update in full because the Auto Fixes update is separate. The report does include `state()`, store types, and transactional helpers, which is promising, but I would not assume the state-control policy and policy context updates are fully implemented without code/test verification.  

---

# 7. Policy comparison

## What we defined

Policies should use:

```ts
definePolicy("@executioncontrolprotocol", "budget")
  .withConfig(...)
  .withHooks([
    hook("policy:pre", ...),
    hook("policy:post", ...),
    hook("policy:finally", ...)
  ])
```

Standard policies:

| Policy               | Required                                          |
| -------------------- | ------------------------------------------------- |
| `@executioncontrolprotocol/budget`        | Yes                                               |
| `@executioncontrolprotocol/approval`      | Yes                                               |
| `@executioncontrolprotocol/state-control` | Added in Auto Fixes                               |
| `@executioncontrolprotocol/citations`     | Planned, not required for earliest implementation |

## What was implemented

The implementation report confirms policy lifecycle types and `PolicyDecision` exist. It also says standard policies are packaged, but the gap section says `@executioncontrolprotocol/citations` is not implemented. 

The Auto Fixes spec says `@executioncontrolprotocol/state-control` should be added to `@executioncontrolprotocol/policies`, with config for allowed mutable paths, denied paths, mutation ops, required reason, max mutations, and max payload. 

## Assessment

**Partially aligned.**

Likely implemented:

| Policy area                 | Status             |
| --------------------------- | ------------------ |
| Policy hooks                | Implemented        |
| Policy decision combination | Implemented        |
| Budget policy               | Likely implemented |
| Approval policy             | Likely implemented |

Unclear or missing:

| Policy area                   | Gap                                    |
| ----------------------------- | -------------------------------------- |
| `@executioncontrolprotocol/state-control`          | Not confirmed in implementation report |
| `@executioncontrolprotocol/citations`              | Explicitly not implemented             |
| Mutation-aware policy context | Not confirmed                          |
| Usage reporting completeness  | Not confirmed                          |

Recommended next actions:

1. Add/verify `@executioncontrolprotocol/state-control`.
2. Add tests for `state()` mutation denial and approval.
3. Add mutation summary to `policy:finally`.
4. Keep `@executioncontrolprotocol/citations` deferred unless needed.

---

# 8. Describe/search comparison

## What we defined

`environment.describe(query?)` should be the agent/UI discovery API. It should expose:

* environment
* runtime features
* extensions
* capabilities
* policies
* schemas
* examples
* constraints

It should support GraphQL-like object queries:

```ts
env.describe({
  capabilities: {
    match: "slack",
    mode: "fuzzy",
    include: ["id", "label", "inputSchema", "outputSchema", "examples"]
  }
})
```

Search should support fuzzy/semantic discovery.

## What was implemented

The implementation report says describe/search are done but basic: “Environment catalog + substring search.” It also lists `buildDescriptor` and `searchCapabilities`, with substring capability search. 

The gaps section explicitly says semantic search is not implemented. 

## Assessment

**Partially aligned.**

Implemented:

| Feature                  | Status                 |
| ------------------------ | ---------------------- |
| Descriptor generation    | Basic done             |
| Query input for describe | CLI supports `--query` |
| Search command           | Done                   |
| Substring matching       | Done                   |

Gaps:

| Feature                                    | Gap                |
| ------------------------------------------ | ------------------ |
| Fuzzy matching                             | Not clear          |
| Semantic search                            | Explicitly missing |
| Field-level `include` behavior             | Need verify        |
| Policy/extension/capability query breadth  | Need verify        |
| Agent-ready examples in descriptor         | Need verify        |
| State handle support in capability schemas | Need verify        |

Recommended changes:

1. Expand `DescribeQuery` support beyond simple filtering.
2. Implement `include` field projection consistently.
3. Add fuzzy search first, semantic later.
4. Ensure descriptor includes policies, runtime features, extension bindings, capability schemas, examples, and constraints.
5. Add MCP tests that simulate an agent discovering a capability and building a workflow.

---

# 9. MCP comparison

## What we defined

MCP should be a separate package exposing tools, resources, and prompts:

Minimum tools:

| Tool                       |
| -------------------------- |
| `ecp.describe_environment` |
| `ecp.search`               |
| `ecp.validate_workflow`    |
| `ecp.run_workflow`         |
| `ecp.get_run_status`       |

Later:

| Tool                 |
| -------------------- |
| `ecp.get_run_events` |
| `ecp.get_run_state`  |
| `ecp.cancel_run`     |
| `ecp.resume_run`     |

Resources:

| Resource                     |
| ---------------------------- |
| `ecp://environment/describe` |
| `ecp://capabilities`         |
| `ecp://capabilities/{id}`    |
| `ecp://policies`             |
| `ecp://runs/{runId}`         |
| `ecp://examples/workflows`   |

Prompts:

| Prompt                    |
| ------------------------- |
| `ecp.author_workflow`     |
| `ecp.repair_workflow`     |
| `ecp.explain_environment` |

## What was implemented

The report says `@executioncontrolprotocol/mcp` has `createEcpMcpServer`, `serveStdio`, and `serveHttp`, but `serveHttp` is a placeholder. It says MCP tools include describe, search, validate, run, and get_run_status. 

The executive summary says MCP adapter is “Package only” and not on CLI. 

The gaps section says `ecp mcp serve` is deferred. 

## Assessment

**Good start, incomplete vs our target.**

Aligned:

| MCP item         | Status              |
| ---------------- | ------------------- |
| Separate package | Done                |
| Core tools       | Mostly done         |
| Stdio transport  | Present             |
| MCP tests        | Report says present |

Gaps:

| MCP item              | Required change                                        |
| --------------------- | ------------------------------------------------------ |
| `ecp mcp serve` CLI   | Implement                                              |
| HTTP transport        | Complete; currently placeholder                        |
| MCP resources         | Not confirmed                                          |
| MCP prompts           | Not confirmed                                          |
| Run event/state tools | Not confirmed                                          |
| Cancel/resume tools   | Not implemented                                        |
| Security hardening    | Need verify validation-before-run and no policy bypass |

Recommended priority:

1. Add `ecp mcp serve --env ... --transport stdio`.
2. Finish HTTP transport or explicitly mark unsupported.
3. Add MCP resources for environment/capability/policies.
4. Add prompts for author/repair/explain.
5. Add tests where MCP validates workflow before run.

---

# 10. CLI comparison

## What we defined

CLI commands:

```bash
ecp compile workflow.ts
ecp validate workflow.json --env environment.ts
ecp describe --env environment.ts
ecp search "send message" --env environment.ts
ecp run workflow.json --env environment.ts --input input.json
ecp mcp serve --env environment.ts --transport stdio
ecp mcp serve --env environment.ts --transport http --port 8787
```

## What was implemented

The implementation report says CLI has five Oclif commands: `compile`, `validate`, `describe`, `search`, and `run`. 

It also says CLI is partial vs the spec: no `mcp serve`, no `config`. 

## Assessment

**Partially aligned.**

Done:

| CLI command | Status |
| ----------- | ------ |
| `compile`   | Done   |
| `validate`  | Done   |
| `describe`  | Done   |
| `search`    | Done   |
| `run`       | Done   |

Missing:

| CLI command       | Status                                                            |
| ----------------- | ----------------------------------------------------------------- |
| `mcp serve`       | Missing                                                           |
| `config`          | Mentioned as missing, but not necessarily required by latest spec |
| `trace` / `graph` | Archived only; optional future                                    |

Recommended next change:

```bash
ecp mcp serve --env environment.ts --transport stdio
ecp mcp serve --env environment.ts --transport http --port 8787
```

This is the most important CLI gap because it unlocks agent usage.

---

# 11. Extension comparison

## What we defined

First-party extensions:

| Extension                  | Required capability                   |
| -------------------------- | ------------------------------------- |
| `@executioncontrolprotocol/extension-memory`    | `search`, `remember`, lifecycle hooks |
| `@executioncontrolprotocol/extension-openai`    | `generate`, `evaluate`                |
| `@executioncontrolprotocol/extension-slack`     | `send`                                |
| `@executioncontrolprotocol/extension-storage`   | `write`, `read` eventually            |
| `@executioncontrolprotocol/extension-telemetry` | hooks only                            |
| `@executioncontrolprotocol/extensions`          | convenience bundle                    |

## What was implemented

The report lists:

| Package                    | Capabilities              |
| -------------------------- | ------------------------- |
| `@executioncontrolprotocol/extension-memory`    | `search`, `remember`      |
| `@executioncontrolprotocol/extension-openai`    | `generate`                |
| `@executioncontrolprotocol/extension-ollama`    | `generate`                |
| `@executioncontrolprotocol/extension-slack`     | `send` mock               |
| `@executioncontrolprotocol/extension-storage`   | none                      |
| `@executioncontrolprotocol/extension-telemetry` | hooks only                |
| `@executioncontrolprotocol/extensions`          | `registerAllExtensions()` |



## Assessment

**Mostly aligned, with expected stubs.**

Gaps:

| Extension    | Gap                                                             |
| ------------ | --------------------------------------------------------------- |
| OpenAI       | `evaluate` not listed; only `generate`                          |
| Slack        | Mock only; needs real integration later                         |
| Storage      | No capabilities                                                 |
| Memory hooks | Need verify hydration/writeback behavior, not just capabilities |
| Telemetry    | Hooks exist, but output/flush behavior needs verify             |
| Ollama       | Good addition for local model strategy                          |

Recommended next actions:

1. Add `@executioncontrolprotocol/openai.evaluate`.
2. Implement storage read/write.
3. Decide whether Slack mock is enough for test/demo or needs real SDK package.
4. Verify memory lifecycle hooks: `step:before`, `step:completed`, `run:finally`.

---

# 12. Types/schema comparison

## What we defined

`@executioncontrolprotocol/types` should include:

* protocol types
* schema constants
* lifecycle event names
* JSON schema artifacts
* version helpers
* validation result types

## What was implemented

The report says `@executioncontrolprotocol/types` includes protocol types such as validation, lifecycle, store, and run types. 

But the gaps section says:

* JSON Schema artifacts in types are TS-only
* Auto-generated schema dist is not present



## Assessment

**Partially aligned.**

This is a clear gap against the package decision.

Required changes:

1. Add JSON Schema exports for:

   * workflow manifest
   * environment manifest
   * environment descriptor
   * run request/result
   * validation result
2. Add generated schema dist.
3. Keep dependencies lightweight.
4. Add tests that validate example JSON against schemas.

---

# 13. Temporal comparison

## What we defined

Temporal should be an optional runtime adapter package with:

* durable orchestration
* workflow interpreter
* activity dispatcher
* pause/resume
* policy-constrained retries

## What was implemented

The report says `@executioncontrolprotocol/temporal` executor is a stub constant only. 

## Assessment

**Not implemented.**

That is acceptable if intentionally deferred, but we should track it as a major future milestone.

Required later:

| Area                                  | Required |
| ------------------------------------- | -------- |
| Temporal workflow interpreter         | Not done |
| Activity dispatcher                   | Not done |
| Signal/update pause/resume            | Not done |
| Policy-constrained retry integration  | Not done |
| Durable state/run history integration | Not done |

---

# 14. Major gaps requiring action

## Priority 1: Verify and complete `state()` transactional mutation model

The report shows the right ingredients exist, but this is the area where semantics matter most.

Required tests:

| Test                                                                    | Expected                                 |
| ----------------------------------------------------------------------- | ---------------------------------------- |
| Capability calls `ctx.store.merge(input.target, ...)` with `state("x")` | Pending mutation created                 |
| Capability tries raw string write                                       | Runtime rejects                          |
| `policy:post` denies mutation                                           | No mutation committed, no `.as()` commit |
| Capability throws after store write                                     | Mutation discarded                       |
| Step succeeds                                                           | Mutation and `.as()` commit together     |
| State-control policy denies path                                        | Step fails/pauses                        |
| Run history includes mutation record                                    | Mutation audit exists                    |

## Priority 2: Add `@executioncontrolprotocol/state-control`

The Auto Fixes spec explicitly calls for a first-party state-control policy. 

Config should include:

```ts
allowedMutablePaths?: string[];
deniedMutablePaths?: string[];
allowedMutationOps?: Array<"set" | "replace" | "merge" | "append">;
requireReason?: boolean;
maxMutationsPerStep?: number;
maxMutationPayloadKb?: number;
```

## Priority 3: Complete MCP CLI + resources/prompts

MCP exists, but agent usability depends on CLI serving and discoverable resources/prompts.

Required:

```bash
ecp mcp serve --env environment.ts --transport stdio
ecp mcp serve --env environment.ts --transport http --port 8787
```

## Priority 4: Upgrade describe/search

Current substring search is enough for a first pass but below our target. The report explicitly marks semantic search as missing. 

Add:

* fuzzy match
* `include` field projection
* multi-object query support
* capability examples
* policy summaries
* state handle schema visibility

## Priority 5: JSON Schema artifacts

The report explicitly says JSON Schema artifacts and generated schema dist are not present. 

This should be fixed before publishing packages broadly.

---

# 15. Honest final assessment

## What the agents got right

They implemented the most important architectural decisions:

* Core package includes fluent API and local runtime.
* Workflow manifests are portable and environment-free.
* Environment executes workflows.
* Definitions/bindings/invocations are separated.
* `step(ref, label?).with(...).as(...)` is implemented.
* `state()` exists.
* Store mutation types exist.
* Local runtime exists.
* CLI basics exist.
* MCP package exists.
* Optional extensions are split into packages.

That is a very strong implementation pass.

## What is incomplete

The implementation is best described as:

> **A solid v1 core implementation with partial MCP, basic discovery/search, stub durable runtime/storage, and unclear completion of policy-governed transactional state mutation semantics.**

## My recommendation

Before adding major new features, I would run one hardening sprint focused on:

1. **State mutation semantics**
2. **State-control policy**
3. **MCP serve CLI**
4. **Describe/search completeness**
5. **JSON Schema artifacts**
6. **End-to-end tests**

If those are fixed, the implementation will match the architecture closely enough to become a stable internal alpha.
