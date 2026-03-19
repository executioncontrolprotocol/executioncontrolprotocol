/**
 * ECP Execution Engine — the core runner that orchestrates a Context
 * execution from start to finish.
 *
 * Slice 1: Single executor, seed mounts, model generation, schema validation.
 * Slice 2 (added in Milestone 7): Controller-specialist delegation.
 *
 * @category Engine
 */

import type {
  ECPContext,
  Executor,
  ExtensionSecurityPolicy,
  ModelProviderReference,
  ModelProviderSelector,
  Orchestrator,
  SchemaDefinition,
} from "@executioncontrolprotocol/spec";
import type { ModelProvider, ChatMessage, ToolDefinition, ToolCall } from "../providers/model-provider.js";
import type { ToolInvoker } from "../protocols/tool-invoker.js";
import type { AgentTransport, AgentRef, DelegatedTask } from "../protocols/agent-transport.js";
import type {
  EngineConfig,
  ExecutionResult,
  RunState,
  ExecutorState,
  BudgetUsage,
  RunLogEntry,
  ResolvedInputs,
  ExecutionProgressEvent,
} from "./types.js";
import { loadContext, resolveInputs } from "./context-loader.js";
import { validateOutput } from "./schema-validator.js";
import { DefaultMountHydrator } from "../mounts/hydrator.js";
import { createPolicyEnforcer } from "../policies/enforcer.js";
import type { PolicyEnforcer } from "../policies/types.js";
import type { TraceCollector } from "../tracing/collector.js";
import type { ExtensionRegistry } from "../extensions/registry.js";
import type { MemoryStoreLike } from "./types.js";

/**
 * Options for a single Context execution.
 *
 * @category Engine
 */
export interface RunOptions {
  /** Path to the Context manifest (YAML or JSON). */
  contextPath?: string;

  /** Pre-loaded Context object (alternative to `contextPath`). */
  context?: ECPContext;

  /** Input values for the Context. */
  inputs?: Record<string, string | number | boolean>;

  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

/**
 * The ECP execution engine.
 *
 * Wires together the model provider, tool invoker, and agent transport
 * to execute a Context manifest end-to-end.
 *
 * @category Engine
 */
export class ECPEngine {
  private readonly modelProvider: ModelProvider;
  private readonly extensionRegistry?: ExtensionRegistry;
  private readonly modelProviderCache = new Map<string, ModelProvider>();
  private readonly toolInvoker: ToolInvoker;
  private readonly agentTransport: AgentTransport;
  private readonly config: EngineConfig;
  private readonly hydrator: DefaultMountHydrator;
  private traceCollector?: TraceCollector;

  constructor(
    modelProvider: ModelProvider,
    toolInvoker: ToolInvoker,
    agentTransport: AgentTransport,
    config: EngineConfig = {},
  ) {
    this.modelProvider = modelProvider;
    this.extensionRegistry = config.extensions?.registry;
    this.toolInvoker = toolInvoker;
    this.agentTransport = agentTransport;
    this.config = config;
    this.hydrator = new DefaultMountHydrator(toolInvoker);
  }

  /**
   * Attach a trace collector to the engine.
   * When attached, the engine emits structured trace spans during execution.
   */
  setTraceCollector(collector: TraceCollector): void {
    this.traceCollector = collector;
  }

  /**
   * Execute a Context manifest end-to-end.
   *
   * @param options - Run configuration.
   * @returns The execution result.
   */
  async run(options: RunOptions): Promise<ExecutionResult> {
    const startTime = Date.now();
    const state = await this.initRunState(options);

    try {
      await this.connectToolServers(state);

      const strategy = this.getStrategy(state.context);

      if (strategy === "single") {
        await this.runSingleExecutor(state, options.signal);
      } else if (strategy === "sequential" || strategy === "delegate" || strategy === "swarm") {
        await this.runControllerSpecialist(state, options.signal);
      } else {
        throw new Error(`Unsupported orchestration strategy: "${strategy}"`);
      }

      state.status = "completed";
      state.endedAt = new Date().toISOString();
      await this.emitProgress(state, { type: "phase", status: "completed" });
    } catch (err) {
      state.status = "failed";
      state.endedAt = new Date().toISOString();
      await this.emitProgress(state, { type: "phase", status: "failed" });
      this.log(state, "error", `Execution failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await this.toolInvoker.disconnectAll();
    }

    const result = this.buildResult(state, startTime);

    if (this.traceCollector) {
      const trace = this.traceCollector.buildTrace({
        executionId: state.runId,
        contextName: state.context.metadata.name,
        contextVersion: state.context.metadata.version,
        strategy: this.getStrategy(state.context),
        startedAt: state.startedAt,
        endedAt: state.endedAt ?? new Date().toISOString(),
        durationMs: result.durationMs,
        success: result.success,
        error: result.error,
      });
      result.trace = trace;
      await this.traceCollector.exportAll(trace);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Slice 1: Single executor
  // ---------------------------------------------------------------------------

  private async runSingleExecutor(
    state: RunState,
    signal?: AbortSignal,
  ): Promise<void> {
    const entrypointName = this.getEntrypointName(state.context);
    const executorState = state.executors.get(entrypointName);
    if (!executorState) {
      throw new Error(`Entrypoint executor "${entrypointName}" not found`);
    }

    state.status = "hydrating-seed";
    await this.emitProgress(state, { type: "phase", status: "hydrating-seed" });
    this.log(state, "info", `Hydrating seed mounts for "${entrypointName}"`);
    await this.hydrateMounts(state, executorState, state.inputs, "seed");

    state.status = "running-orchestrator";
    await this.emitProgress(state, { type: "phase", status: "running-orchestrator" });
    this.log(state, "info", `Running executor "${entrypointName}"`);
    await this.runExecutor(executorState, state, signal);
  }

  // ---------------------------------------------------------------------------
  // Slice 2: Controller-specialist
  // ---------------------------------------------------------------------------

  private async runControllerSpecialist(
    state: RunState,
    signal?: AbortSignal,
  ): Promise<void> {
    const entrypointName = this.getEntrypointName(state.context);
    const orchestratorState = state.executors.get(entrypointName);
    if (!orchestratorState) {
      throw new Error(`Orchestrator executor "${entrypointName}" not found`);
    }

    // Phase 1: Hydrate orchestrator seed mounts
    state.status = "hydrating-seed";
    await this.emitProgress(state, { type: "phase", status: "hydrating-seed" });
    this.log(state, "info", `Hydrating seed mounts for orchestrator "${entrypointName}"`);
    await this.hydrateMounts(state, orchestratorState, state.inputs, "seed");

    // Phase 2: Run orchestrator to produce plan
    state.status = "running-orchestrator";
    await this.emitProgress(state, { type: "phase", status: "running-orchestrator" });
    this.log(state, "info", `Running orchestrator "${entrypointName}"`);
    await this.runExecutor(orchestratorState, state, signal);

    if (!orchestratorState.output) {
      throw new Error("Orchestrator did not produce an output");
    }

    const plan = orchestratorState.output;
    const delegations = (plan.delegate ?? []) as Array<{
      executor: string;
      task: string;
      hints?: Record<string, unknown>;
    }>;

    if (delegations.length === 0) {
      this.log(state, "info", "No delegations in plan, execution complete");
      return;
    }

    // Phase 3: Hydrate focus mounts for specialists and delegate tasks
    state.status = "delegating";
    await this.emitProgress(state, { type: "phase", status: "delegating" });
    this.log(state, "info", `Delegating ${delegations.length} task(s) to specialists`);

    for (const delegation of delegations) {
      const specialistState = state.executors.get(delegation.executor);
      if (!specialistState) {
        this.log(state, "warn", `Specialist "${delegation.executor}" not found, skipping`);
        continue;
      }

      // Hydrate focus mounts using plan output as selector source
      state.status = "hydrating-focus";
      await this.emitProgress(state, { type: "phase", status: "hydrating-focus" });
      await this.hydrateMounts(state, specialistState, state.inputs, "focus", plan);

      state.status = "hydrating-deep";
      await this.emitProgress(state, { type: "phase", status: "hydrating-deep" });
      await this.hydrateMounts(state, specialistState, state.inputs, "deep", plan);

      // Run specialist (locally or via A2A)
      state.status = "running-specialist";
      await this.emitProgress(state, { type: "phase", status: "running-specialist" });
      const endpoint = this.config.agentEndpoints?.[delegation.executor];

      if (endpoint) {
        await this.delegateViaA2A(specialistState, delegation, endpoint, state);
      } else {
        this.log(state, "info", `Running specialist "${delegation.executor}" locally`);
        await this.runExecutor(specialistState, state, signal, delegation.task);
      }
    }

    // Phase 4: Merge outputs if there's a publisher/merger executor
    const producesSchema = state.context.orchestration?.produces;
    if (producesSchema) {
      state.status = "merging";
      await this.emitProgress(state, { type: "phase", status: "merging" });
      await this.mergeOutputs(state, producesSchema, signal);
    }
  }

  private async delegateViaA2A(
    specialistState: ExecutorState,
    delegation: { executor: string; task: string; hints?: Record<string, unknown> },
    endpoint: string,
    state: RunState,
  ): Promise<void> {
    this.log(state, "info", `Delegating to "${delegation.executor}" via A2A at ${endpoint}`);

    const stepNum = this.nextStep(state);
    await this.emitProgress(state, {
      type: "step_start",
      step: stepNum,
      kind: "delegation",
      executorName: delegation.executor,
      description: `Delegate to ${delegation.executor}`,
    });

    const startDel = Date.now();
    const agentRef: AgentRef = {
      name: delegation.executor,
      endpoint,
    };

    const task: DelegatedTask = {
      id: `${state.runId}-${delegation.executor}`,
      executorName: delegation.executor,
      task: delegation.task,
      context: {
        mountData: specialistState.mountOutputs.map((m) => ({
          name: m.mountName,
          data: m.data,
        })),
      },
      hints: delegation.hints,
    };

    const result = await this.agentTransport.delegate(agentRef, task);

    await this.emitProgress(state, {
      type: "step_complete",
        step: this.nextCompleteStep(state),
        kind: "delegation",
      executorName: delegation.executor,
      description: `Delegate to ${delegation.executor}`,
      durationMs: Date.now() - startDel,
    });

    specialistState.status = result.success ? "completed" : "failed";
    specialistState.output = result.output;
    specialistState.error = result.error;
  }

  private async mergeOutputs(
    state: RunState,
    producesSchemaName: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const executorNames = [...state.executors.keys()];
    const mergerName = executorNames.find((name) => {
      const ex = state.executors.get(name)!;
      const ref = ex.executor.outputSchemaRef?.replace("#/schemas/", "");
      return ref === producesSchemaName && name !== this.getEntrypointName(state.context);
    });

    if (mergerName) {
      const mergerState = state.executors.get(mergerName)!;
      this.log(state, "info", `Running merger "${mergerName}"`);

      const priorOutputs: Record<string, unknown> = {};
      for (const [name, es] of state.executors) {
        if (es.output && name !== mergerName) {
          priorOutputs[name] = es.output;
        }
      }

      mergerState.mountOutputs.push({
        mountName: "__prior_outputs",
        stage: "seed",
        data: priorOutputs,
        itemCount: Object.keys(priorOutputs).length,
      });

      await this.runExecutor(mergerState, state, signal);
      return;
    }

    this.log(state, "info", "No dedicated merger executor; orchestrator output is final");
  }

  // ---------------------------------------------------------------------------
  // Executor runner (shared by all strategies)
  // ---------------------------------------------------------------------------

  private async runExecutor(
    executorState: ExecutorState,
    state: RunState,
    signal?: AbortSignal,
    taskOverride?: string,
  ): Promise<void> {
    const executor = executorState.executor;
    executorState.status = "running";

    const executorStepNum = this.nextStep(state);
    await this.emitProgress(state, {
      type: "step_start",
      step: executorStepNum,
      kind: "executor",
      executorName: executor.name,
      description: `Executor ${executor.name}`,
    });

    const modelProvider = this.resolveModelProvider(executor, state.context);

    const enforcer = createPolicyEnforcer(executor.policies ?? {});
    const startTime = Date.now();

    const executorSpanId = this.traceCollector?.startSpan({
      type: "executor",
      executorName: executor.name,
    });

    const messages = await this.buildMessages(executor, executorState, state.inputs, taskOverride);
    const tools = await this.getAvailableTools(executor, modelProvider, enforcer, executorState, state);

    const model = this.config.modelOverride ?? executor.model?.name ?? this.config.defaultModel ?? "gpt-4o";
    const outputSchema = this.getOutputSchema(executor, state.context);

    const currentMessages = [...messages];
    const maxRounds = 10;
    let lastTokenUsage: { prompt: number; completion: number; total: number } = {
      prompt: 0,
      completion: 0,
      total: 0,
    };
    let lastModel = model;

    for (let round = 0; round < maxRounds; round++) {
      const budgetCheck = enforcer.checkBudget(executorState.budgetUsage);
      if (!budgetCheck.withinBudget) {
        this.log(state, "warn", `Budget exceeded for "${executor.name}": ${budgetCheck.message}`);
        break;
      }

      const modelStepNum = this.nextStep(state);
      await this.emitProgress(state, {
        type: "step_start",
        step: modelStepNum,
        kind: "model",
        executorName: executor.name,
        description: `Executor ${executor.name} — ${model}`,
      });

      const genSpanId = this.traceCollector?.startSpan({
        type: "model-generation",
        executorName: executor.name,
        parentId: executorSpanId,
        model,
      });

      const genStart = Date.now();
      const result = await modelProvider.generate({
        messages: currentMessages,
        model,
        tools: tools.length > 0 ? tools : undefined,
        temperature: this.config.defaultTemperature,
        responseFormat: outputSchema ? {
          type: "json-schema",
          schema: this.schemaToJsonSchema(outputSchema, executor),
        } : undefined,
        signal,
      });

      const reasoning = result.finishReason === "tool-calls" ? result.content || undefined : undefined;
      if (reasoning) {
        await this.emitProgress(state, {
          type: "executor_reasoning",
          executorName: executor.name,
          reasoning,
        });
      }

      if (genSpanId) {
        this.traceCollector?.endSpan(genSpanId, {
          tokens: {
            prompt: result.usage.promptTokens,
            completion: result.usage.completionTokens,
            total: result.usage.totalTokens,
          },
          reasoning: reasoning ?? undefined,
          output: result.finishReason !== "tool-calls" ? this.tryParseJson(result.content) : undefined,
        });
      }

      lastTokenUsage = {
        prompt: lastTokenUsage.prompt + result.usage.promptTokens,
        completion: lastTokenUsage.completion + result.usage.completionTokens,
        total: lastTokenUsage.total + result.usage.totalTokens,
      };
      lastModel = model;

      await this.emitProgress(state, {
        type: "step_complete",
        step: this.nextCompleteStep(state),
        kind: "model",
        executorName: executor.name,
        description: `Executor ${executor.name} — ${model}`,
        durationMs: Date.now() - genStart,
        reasoning: reasoning ?? undefined,
      });

      if (result.finishReason === "tool-calls" && result.toolCalls.length > 0) {
        currentMessages.push({
          role: "assistant",
          content: result.content,
        });

        const toolResults = await this.executeToolCalls(
          result.toolCalls,
          executor,
          enforcer,
          executorState,
          state,
          executorSpanId,
        );

        for (const tr of toolResults) {
          currentMessages.push(tr);
        }

        continue;
      }

      executorState.budgetUsage.runtimeSeconds = (Date.now() - startTime) / 1000;

      if (result.content) {
        try {
          const parsed = JSON.parse(result.content);
          executorState.output = typeof parsed === "object" && parsed !== null
            ? parsed as Record<string, unknown>
            : { result: parsed };
        } catch {
          executorState.output = { result: result.content };
        }
      }

      break;
    }

    if (executorState.output && outputSchema) {
      const validation = validateOutput(executorState.output, outputSchema);
      if (!validation.valid) {
        this.log(
          state,
          "warn",
          `Output validation failed for "${executor.name}": ${validation.errors.join(", ")}`,
        );
      }
    }

    executorState.status = executorState.output ? "completed" : "failed";
    executorState.error = executorState.output ? undefined : "No output produced";

    await this.emitProgress(state, {
      type: "step_complete",
      step: this.nextExecutorStep(state),
      kind: "executor",
      executorName: executor.name,
      description: `Executor ${executor.name}`,
      durationMs: Date.now() - startTime,
      output: executorState.output,
      tokens: lastTokenUsage.total > 0 ? lastTokenUsage : undefined,
      model: lastModel,
    });

    if (executorSpanId) {
      this.traceCollector?.endSpan(executorSpanId, {
        output: executorState.output,
        error: executorState.error,
      });
    }

    this.log(state, "info",
      `Executor "${executor.name}" ${executorState.status} (${executorState.budgetUsage.runtimeSeconds.toFixed(1)}s)`,
    );
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    executor: Executor,
    enforcer: PolicyEnforcer,
    executorState: ExecutorState,
    state: RunState,
    parentSpanId?: string,
  ): Promise<ChatMessage[]> {
    const results: ChatMessage[] = [];
    const store = this.config.memoryStore as MemoryStoreLike | undefined;
    const memoryScope = executor.memory?.scope;
    const allowRead = executor.policies?.memoryAccess?.allowRead === true;
    const allowWrite = executor.policies?.memoryAccess?.allowWrite === true;

    for (const tc of toolCalls) {
      executorState.budgetUsage.toolCalls++;

      if (
        store &&
        memoryScope &&
        (tc.name === "ecp:memory/store" || tc.name === "ecp:memory/delete" || tc.name === "ecp:memory/list")
      ) {
        const allowed =
          (tc.name === "ecp:memory/list" && allowRead) ||
          ((tc.name === "ecp:memory/store" || tc.name === "ecp:memory/delete") && allowWrite);
        if (!allowed) {
          this.log(state, "warn", `Memory tool denied by policy: ${tc.name}`);
          results.push({
            role: "tool",
            toolCallId: tc.id,
            content: JSON.stringify({ error: "Memory access not allowed by policy." }),
          });
          continue;
        }

        const toolStepNum = this.nextStep(state);
        await this.emitProgress(state, {
          type: "step_start",
          step: toolStepNum,
          kind: "tool",
          executorName: executorState.executor.name,
          description: `Tool ${tc.name}`,
        });
        const toolStart = Date.now();

        try {
          const args = (typeof tc.arguments === "string" ? JSON.parse(tc.arguments || "{}") : tc.arguments) as Record<string, unknown>;
          let content: string;

          if (tc.name === "ecp:memory/store") {
            const summary = String(args.summary ?? "");
            const payload = args.payload as Record<string, unknown> | undefined;
            const record = await store.put(memoryScope, executor.name, summary, payload);
            content = JSON.stringify({ ok: true, id: record.id, summary: record.summary });
          } else if (tc.name === "ecp:memory/delete") {
            const id = args.id as string | undefined;
            const ids = args.ids as string[] | undefined;
            const olderThan = args.olderThan as string | undefined;
            const { deleted } = await store.delete(memoryScope, { id, ids, olderThan });
            content = JSON.stringify({ ok: true, deleted });
          } else {
            const limit = typeof args.limit === "number" ? args.limit : 20;
            const olderThan = args.olderThan as string | undefined;
            const list = await store.list(memoryScope, { limit, olderThan, executorName: executor.name });
            content = JSON.stringify({ items: list });
          }

          await this.emitProgress(state, {
            type: "step_complete",
            step: this.nextCompleteStep(state),
            kind: "tool",
            executorName: executorState.executor.name,
            description: `Tool ${tc.name}`,
            durationMs: Date.now() - toolStart,
          });
          results.push({ role: "tool", toolCallId: tc.id, content });
        } catch (err) {
          this.log(state, "error", `Memory tool ${tc.name} failed: ${err instanceof Error ? err.message : String(err)}`);
          await this.emitProgress(state, {
            type: "step_complete",
            step: this.nextCompleteStep(state),
            kind: "tool",
            executorName: executorState.executor.name,
            description: `Tool ${tc.name}`,
            durationMs: Date.now() - toolStart,
          });
          results.push({
            role: "tool",
            toolCallId: tc.id,
            content: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          });
        }
        continue;
      }

      const [serverName, toolName] = this.parseToolName(tc.name);

      const accessCheck = enforcer.checkToolAccess(tc.name);
      if (!accessCheck.allowed) {
        this.log(state, "warn", `Tool call denied: ${tc.name} — ${accessCheck.reason}`);
        results.push({
          role: "tool",
          toolCallId: tc.id,
          content: JSON.stringify({ error: accessCheck.reason }),
        });
        continue;
      }

      const toolStepNum = this.nextStep(state);
      await this.emitProgress(state, {
        type: "step_start",
        step: toolStepNum,
        kind: "tool",
        executorName: executorState.executor.name,
        description: `Tool ${tc.name}`,
      });

      const toolStart = Date.now();
      const toolSpanId = this.traceCollector?.startSpan({
        type: "tool-call",
        executorName: executorState.executor.name,
        parentId: parentSpanId,
        toolName: tc.name,
        toolArgs: tc.arguments,
      });

      try {
        const result = await this.toolInvoker.callTool(serverName, toolName, tc.arguments);
        this.log(state, "debug", `Tool ${tc.name} returned (isError: ${result.isError})`);

        if (toolSpanId) {
          this.traceCollector?.endSpan(toolSpanId, {
            toolResult: result.content,
            toolIsError: result.isError,
          });
        }

        await this.emitProgress(state, {
          type: "step_complete",
          step: this.nextCompleteStep(state),
          kind: "tool",
          executorName: executorState.executor.name,
          description: `Tool ${tc.name}`,
          durationMs: Date.now() - toolStart,
        });

        results.push({
          role: "tool",
          toolCallId: tc.id,
          content: typeof result.content === "string"
            ? result.content
            : JSON.stringify(result.content),
        });
      } catch (err) {
        if (toolSpanId) {
          this.traceCollector?.endSpan(toolSpanId, {
            error: err instanceof Error ? err.message : String(err),
            toolIsError: true,
          });
        }

        await this.emitProgress(state, {
          type: "step_complete",
          step: this.nextCompleteStep(state),
          kind: "tool",
          executorName: executorState.executor.name,
          description: `Tool ${tc.name}`,
          durationMs: Date.now() - toolStart,
        });

        results.push({
          role: "tool",
          toolCallId: tc.id,
          content: JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async initRunState(options: RunOptions): Promise<RunState> {
    const context = options.context ?? loadContext(options.contextPath!);
    const inputs = resolveInputs(context, options.inputs ?? {});

    const state: RunState = {
      runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      context,
      inputs,
      status: "loading",
      executors: new Map(),
      log: [],
      startedAt: new Date().toISOString(),
    };

    for (const executor of this.getExecutionObjects(context)) {
      state.executors.set(executor.name, {
        executor,
        status: "pending",
        mountOutputs: [],
        budgetUsage: { toolCalls: 0, runtimeSeconds: 0 },
      });
    }

    this.log(state, "info",
      `Loaded Context "${context.metadata.name}" v${context.metadata.version} ` +
      `(${state.executors.size} execution objects, strategy: ${this.getStrategy(context)})`,
    );

    state.progressStepCounter = 0;
    state.progressCompleteCounter = 0;
    state.progressExecutorStepCounter = 0;
    await this.emitProgress(state, { type: "phase", status: "loading" });

    return state;
  }

  private async emitProgress(_state: RunState, event: ExecutionProgressEvent): Promise<void> {
    const callbacks = this.config.onProgress
      ? Array.isArray(this.config.onProgress)
        ? this.config.onProgress
        : [this.config.onProgress]
      : [];
    for (const cb of callbacks) {
      try {
        await cb(event);
      } catch {
        // Ignore progress callback errors so they do not break the run.
      }
    }
  }

  private nextStep(state: RunState): number {
    state.progressStepCounter = (state.progressStepCounter ?? 0) + 1;
    return state.progressStepCounter;
  }

  /** Return the next completion step number (1, 2, 3...) for step_complete events. */
  private nextCompleteStep(state: RunState): number {
    state.progressCompleteCounter = (state.progressCompleteCounter ?? 0) + 1;
    return state.progressCompleteCounter;
  }

  /** Return the next executor step number (1, 2, 3...) for executor step_complete only. */
  private nextExecutorStep(state: RunState): number {
    state.progressExecutorStepCounter = (state.progressExecutorStepCounter ?? 0) + 1;
    return state.progressExecutorStepCounter;
  }

  private async connectToolServers(state: RunState): Promise<void> {
    const servers = this.config.toolServers ?? {};
    for (const [name, config] of Object.entries(servers)) {
      try {
        await this.toolInvoker.connect({ name, transport: config.transport });
        this.log(state, "info", `Connected to tool server "${name}"`);
      } catch (err) {
        this.log(state, "warn",
          `Failed to connect to tool server "${name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async hydrateMounts(
    state: RunState,
    executorState: ExecutorState,
    inputs: ResolvedInputs,
    stage: "seed" | "focus" | "deep",
    planOutput?: Record<string, unknown>,
  ): Promise<void> {
    const mounts = executorState.executor.mounts ?? [];
    const executorName = executorState.executor.name;

    for (const mount of mounts) {
      if (mount.stage !== stage) continue;

      const stepNum = this.nextStep(state);
      await this.emitProgress(state, {
        type: "step_start",
        step: stepNum,
        kind: "mount",
        executorName,
        description: `Mount ${mount.name} (${stage})`,
      });

      const mountSpanId = this.traceCollector?.startSpan({
        type: "mount-hydration",
        executorName: executorState.executor.name,
        mountName: mount.name,
        mountStage: stage,
      });

      const startMount = Date.now();
      const outputs = await this.hydrator.hydrateStage([mount], stage, inputs, planOutput);
      executorState.mountOutputs.push(...outputs);
      const durationMs = Date.now() - startMount;

      if (mountSpanId) {
        const totalItems = outputs.reduce((sum, o) => sum + o.itemCount, 0);
        this.traceCollector?.endSpan(mountSpanId, { mountItemCount: totalItems });
      }

      await       this.emitProgress(state, {
        type: "step_complete",
        step: this.nextCompleteStep(state),
        kind: "mount",
        executorName,
        description: `Mount ${mount.name} (${stage})`,
        durationMs,
      });
    }
  }

  private async buildMessages(
    executor: Executor,
    executorState: ExecutorState,
    inputs: ResolvedInputs,
    taskOverride?: string,
  ): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];

    if (executor.instructions) {
      messages.push({
        role: "system",
        content: executor.instructions,
      });
    }

    const mountContext = executorState.mountOutputs
      .filter((m) => m.itemCount > 0)
      .map((m) => `## ${m.mountName} (${m.stage}, ${m.itemCount} items)\n${JSON.stringify(m.data, null, 2)}`)
      .join("\n\n");

    let memoryBlock = "";
    const store = this.config.memoryStore as MemoryStoreLike | undefined;
    if (
      store &&
      executor.memory &&
      (executor.policies?.memoryAccess?.allowRead === true)
    ) {
      const opts = {
        maxItems: executor.memory.maxItems ?? 20,
        maxTokens: executor.memory.maxTokens,
        executorName: executor.name,
        summariesOnly: true,
      };
      const memories = await store.get(executor.memory.scope, opts);
      if (memories.length > 0) {
        memoryBlock =
          "\n\n## Long-term memory (relevant past context)\n" +
          memories
            .map(
              (m) =>
                `- [${m.createdAt}] ${m.summary}${m.payload ? ` (${JSON.stringify(m.payload)})` : ""}`,
            )
            .join("\n");
      }
    }

    const inputsBlock =
      Object.keys(inputs).length > 0
        ? `Context inputs:\n${JSON.stringify(inputs, null, 2)}\n\n`
        : "";

    const userContent = taskOverride
      ? `Task: ${taskOverride}\n\n${inputsBlock}Available data:\n${mountContext}${memoryBlock}`
      : `${inputsBlock}Execute your role using the following data:\n\n${mountContext}${memoryBlock}`.trim();

    messages.push({
      role: "user",
      content: userContent,
    });

    return messages;
  }

  private async getAvailableTools(
    executor: Executor,
    modelProvider: ModelProvider,
    _enforcer: PolicyEnforcer,
    _executorState: ExecutorState,
    _state: RunState,
  ): Promise<ToolDefinition[]> {
    const tools: ToolDefinition[] = [];

    const store = this.config.memoryStore as MemoryStoreLike | undefined;
    if (store && executor.memory) {
      const allowRead = executor.policies?.memoryAccess?.allowRead === true;
      const allowWrite = executor.policies?.memoryAccess?.allowWrite === true;
      if (allowWrite) {
        tools.push({
          name: "ecp:memory/store",
          description:
            "Store a fact or summary in long-term memory for this executor. Use a short summary and optional JSON payload. Helps refine output across runs.",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "Short summary (used for retrieval; keep under 1-2 sentences)." },
              payload: { type: "object", description: "Optional structured data to store." },
            },
            required: ["summary"],
          },
        });
        tools.push({
          name: "ecp:memory/delete",
          description: "Delete one or more long-term memory entries by id, or by age (olderThan ISO-8601). Use for cleanup.",
          parameters: {
            type: "object",
            properties: {
              id: { type: "string", description: "Single memory id to delete." },
              ids: { type: "array", items: { type: "string" }, description: "Multiple memory ids." },
              olderThan: { type: "string", description: "Delete memories older than this ISO-8601 timestamp." },
            },
          },
        });
      }
      if (allowRead) {
        tools.push({
          name: "ecp:memory/list",
          description: "List recent long-term memory entries (ids and summaries) for this executor. Use to inspect or decide what to delete.",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Max items to return (default 20)." },
              olderThan: { type: "string", description: "Only list entries older than this ISO-8601 timestamp." },
            },
          },
        });
      }
    }

    if (!modelProvider.supportsToolCalling()) return tools;

    const allowed = executor.policies?.toolAccess?.allow ?? [];
    if (allowed.length === 0) return tools;

    for (const toolRef of allowed) {
      const [serverName, toolName] = this.parseToolName(toolRef);
      try {
        const serverTools = await this.toolInvoker.listTools(serverName);
        const match = serverTools.find((t) => t.name === toolName);
        if (match) {
          tools.push({
            name: toolRef,
            description: match.description,
            parameters: match.inputSchema,
          });
        }
      } catch {
        // ignore: server not connected or tool not found
      }
    }

    return tools;
  }

  private getOutputSchema(
    executor: Executor,
    context: ECPContext,
  ): SchemaDefinition | undefined {
    if (executor.outputSchema) {
      return executor.outputSchema;
    }
    if (!executor.outputSchemaRef) return undefined;
    const schemaName = executor.outputSchemaRef.replace("#/schemas/", "");
    return context.schemas?.[schemaName];
  }

  private schemaToJsonSchema(
    schema: SchemaDefinition,
    _executor: Executor,
  ): Record<string, unknown> {
    return {
      type: schema.type,
      properties: schema.properties ?? {},
      required: schema.required ?? [],
      additionalProperties: true,
    };
  }

  private tryParseJson(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      return content || undefined;
    }
  }

  private parseToolName(qualifiedName: string): [string, string] {
    const colonIdx = qualifiedName.indexOf(":");
    if (colonIdx === -1) {
      return ["default", qualifiedName];
    }
    return [qualifiedName.slice(0, colonIdx), qualifiedName.slice(colonIdx + 1)];
  }

  private log(state: RunState, level: RunLogEntry["level"], message: string): void {
    const entry: RunLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    state.log.push(entry);

    if (this.config.debug || level === "error") {
      const prefix = level.toUpperCase().padEnd(5);
      console.error(`[ECP ${prefix}] ${message}`);
    }
  }

  private buildResult(state: RunState, startTime: number): ExecutionResult {
    const executorOutputs: Record<string, Record<string, unknown>> = {};
    const totalBudget: BudgetUsage = { toolCalls: 0, runtimeSeconds: 0 };

    for (const [name, es] of state.executors) {
      if (es.output) {
        executorOutputs[name] = es.output;
      }
      totalBudget.toolCalls += es.budgetUsage.toolCalls;
      totalBudget.runtimeSeconds += es.budgetUsage.runtimeSeconds;
    }

    const producesSchema = state.context.orchestration?.produces;
    let finalOutput: Record<string, unknown> | undefined;

    if (producesSchema) {
      for (const [, es] of state.executors) {
        const ref = es.executor.outputSchemaRef?.replace("#/schemas/", "");
        if (ref === producesSchema && es.output) {
          finalOutput = es.output;
          break;
        }
      }
    }

    if (!finalOutput) {
      const entrypoint = this.getEntrypointName(state.context);
      finalOutput = state.executors.get(entrypoint)?.output;
    }

    const failed = state.status === "failed";
    const errorEntries = state.log.filter((e) => e.level === "error");

    return {
      success: !failed,
      runId: state.runId,
      contextName: state.context.metadata.name,
      contextVersion: state.context.metadata.version,
      output: finalOutput,
      executorOutputs,
      totalBudgetUsage: totalBudget,
      log: state.log,
      durationMs: Date.now() - startTime,
      error: failed ? errorEntries.map((e) => e.message).join("; ") : undefined,
    };
  }

  private getEntrypointName(context: ECPContext): string {
    const entrypoint = context.orchestrator?.name ?? context.orchestration?.entrypoint;
    if (!entrypoint) {
      throw new Error(
        "Context entrypoint is not defined. Set orchestrator.name or orchestration.entrypoint.",
      );
    }
    return entrypoint;
  }

  private getStrategy(context: ECPContext): string {
    const strategy = context.orchestration?.strategy ?? context.orchestrator?.strategy;
    if (!strategy) {
      throw new Error(
        "Context strategy is not defined. Set orchestration.strategy or orchestrator.strategy.",
      );
    }
    return strategy;
  }

  private getExecutionObjects(context: ECPContext): Executor[] {
    const executionObjects = new Map<string, Executor>();
    const addExecutionObject = (executor: Executor): void => {
      if (!executionObjects.has(executor.name)) {
        executionObjects.set(executor.name, executor);
      }
    };

    const visitOrchestrator = (orchestrator: Orchestrator): void => {
      addExecutionObject(orchestrator);
      for (const executor of orchestrator.executors ?? []) {
        addExecutionObject(executor);
      }
      for (const child of orchestrator.orchestrators ?? []) {
        visitOrchestrator(child);
      }
    };

    if (context.orchestrator) {
      visitOrchestrator(context.orchestrator);
    }

    for (const executor of context.executors ?? []) {
      addExecutionObject(executor);
    }

    return [...executionObjects.values()];
  }

  private resolveModelProvider(
    executor: Executor,
    context: ECPContext,
  ): ModelProvider {
    const providerSelector = executor.model?.provider;
    if (!providerSelector || !this.extensionRegistry) {
      return this.modelProvider;
    }

    const providerRef = this.normalizeProviderSelector(providerSelector);
    this.assertModelProviderAllowed(providerRef, context);

    const registration = this.extensionRegistry.getModelProviderRegistration(providerRef.name);
    if (!registration) {
      throw new Error(
        `Model provider extension "${providerRef.name}" is not registered.`,
      );
    }
    if (registration.sourceType !== providerRef.type) {
      throw new Error(
        `Model provider "${providerRef.name}" expected source type "${providerRef.type}", got "${registration.sourceType}".`,
      );
    }
    if (registration.version !== providerRef.version) {
      throw new Error(
        `Model provider "${providerRef.name}" version mismatch: expected "${providerRef.version}", got "${registration.version}".`,
      );
    }

    const cacheKey = `${providerRef.type}:${providerRef.name}:${providerRef.version}`;
    const cached = this.modelProviderCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const providerConfig = context.extensions?.config?.[providerRef.name];
    const created = this.extensionRegistry.createModelProvider(providerRef.name, providerConfig);
    this.modelProviderCache.set(cacheKey, created);
    return created;
  }

  private normalizeProviderSelector(selector: ModelProviderSelector): ModelProviderReference {
    if (typeof selector === "string") {
      return {
        name: selector,
        type: "builtin",
        version: "0.3.0",
      };
    }
    return selector;
  }

  private assertModelProviderAllowed(
    provider: ModelProviderReference,
    context: ECPContext,
  ): void {
    const security = this.getEffectiveExtensionSecurity(context);

    if (security.allowKinds?.length && !security.allowKinds.includes("model-provider")) {
      throw new Error(
        `Model provider "${provider.name}" denied: kind "model-provider" is not allowed.`,
      );
    }

    if (
      security.allowSourceTypes?.length &&
      !security.allowSourceTypes.includes(provider.type)
    ) {
      throw new Error(
        `Model provider "${provider.name}" denied: source type "${provider.type}" is not allowed.`,
      );
    }

    if (security.allowIds?.length && !security.allowIds.includes(provider.name)) {
      throw new Error(
        `Model provider "${provider.name}" denied: provider is not in extensions allowIds.`,
      );
    }

    if (security.denyIds?.includes(provider.name)) {
      throw new Error(
        `Model provider "${provider.name}" denied: provider is listed in extensions denyIds.`,
      );
    }

    const runtimeEnable = this.config.extensions?.enable;
    const allowEnable = this.config.extensions?.allowEnable;
    if (allowEnable !== undefined && allowEnable.length > 0) {
      if (!allowEnable.includes(provider.name)) {
        throw new Error(
          `Model provider "${provider.name}" denied: not in system config allow-list (allowEnable).`,
        );
      }
    }
    if (runtimeEnable !== undefined && runtimeEnable.length > 0) {
      if (!runtimeEnable.includes(provider.name)) {
        throw new Error(
          `Model provider "${provider.name}" denied: provider is not enabled for this run (extensions.enable).`,
        );
      }
    } else {
      const contextProviderIds = new Set(
        context.extensions?.providers?.map((p) => p.name) ?? [],
      );
      if (contextProviderIds.size > 0 && !contextProviderIds.has(provider.name)) {
        throw new Error(
          `Model provider "${provider.name}" denied: provider is not declared in context.extensions.providers.`,
        );
      }
    }
  }

  private getEffectiveExtensionSecurity(
    context: ECPContext,
  ): ExtensionSecurityPolicy {
    const contextPolicy = context.extensions?.security;
    const systemPolicy = this.config.extensions?.security;
    const allowKinds = systemPolicy?.allowKinds ?? contextPolicy?.allowKinds;
    const allowSourceTypes =
      systemPolicy?.allowSourceTypes ?? contextPolicy?.allowSourceTypes;
    return {
      ...contextPolicy,
      ...systemPolicy,
      allowKinds,
      // Default: allow all builtin extensions when not specified
      allowSourceTypes:
        allowSourceTypes !== undefined && allowSourceTypes.length > 0
          ? allowSourceTypes
          : ["builtin"],
      allowIds: systemPolicy?.allowIds ?? contextPolicy?.allowIds,
      denyIds: systemPolicy?.denyIds ?? contextPolicy?.denyIds,
    };
  }
}
