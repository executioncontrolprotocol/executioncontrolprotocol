/**
 * ECP Execution Engine — the core runner that orchestrates a Context
 * execution from start to finish.
 *
 * Slice 1: Single executor, seed mounts, model generation, schema validation.
 * Slice 2 (added in Milestone 7): Controller-specialist delegation.
 *
 * @category Engine
 */

import type { ECPContext, Executor, Orchestrator, SchemaDefinition } from "@ecp/spec";
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
} from "./types.js";
import { loadContext, resolveInputs } from "./context-loader.js";
import { validateOutput } from "./schema-validator.js";
import { DefaultMountHydrator } from "../mounts/hydrator.js";
import { createPolicyEnforcer } from "../policies/enforcer.js";
import type { PolicyEnforcer } from "../policies/types.js";

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
  private readonly toolInvoker: ToolInvoker;
  private readonly agentTransport: AgentTransport;
  private readonly config: EngineConfig;
  private readonly hydrator: DefaultMountHydrator;

  constructor(
    modelProvider: ModelProvider,
    toolInvoker: ToolInvoker,
    agentTransport: AgentTransport,
    config: EngineConfig = {},
  ) {
    this.modelProvider = modelProvider;
    this.toolInvoker = toolInvoker;
    this.agentTransport = agentTransport;
    this.config = config;
    this.hydrator = new DefaultMountHydrator(toolInvoker);
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
    } catch (err) {
      state.status = "failed";
      state.endedAt = new Date().toISOString();
      this.log(state, "error", `Execution failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await this.toolInvoker.disconnectAll();
    }

    return this.buildResult(state, startTime);
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
    this.log(state, "info", `Hydrating seed mounts for "${entrypointName}"`);
    await this.hydrateMounts(executorState, state.inputs, "seed");

    state.status = "running-orchestrator";
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
    this.log(state, "info", `Hydrating seed mounts for orchestrator "${entrypointName}"`);
    await this.hydrateMounts(orchestratorState, state.inputs, "seed");

    // Phase 2: Run orchestrator to produce plan
    state.status = "running-orchestrator";
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
    this.log(state, "info", `Delegating ${delegations.length} task(s) to specialists`);

    for (const delegation of delegations) {
      const specialistState = state.executors.get(delegation.executor);
      if (!specialistState) {
        this.log(state, "warn", `Specialist "${delegation.executor}" not found, skipping`);
        continue;
      }

      // Hydrate focus mounts using plan output as selector source
      state.status = "hydrating-focus";
      await this.hydrateMounts(specialistState, state.inputs, "focus", plan);

      state.status = "hydrating-deep";
      await this.hydrateMounts(specialistState, state.inputs, "deep", plan);

      // Run specialist (locally or via A2A)
      state.status = "running-specialist";
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

    const enforcer = createPolicyEnforcer(executor.policies ?? {});
    const startTime = Date.now();

    const messages = this.buildMessages(executor, executorState, taskOverride);
    const tools = await this.getAvailableTools(executor, enforcer, state);

    const model = executor.model?.name ?? this.config.defaultModel ?? "gpt-4o";
    const outputSchema = this.getOutputSchema(executor, state.context);

    const currentMessages = [...messages];
    const maxRounds = 10;

    for (let round = 0; round < maxRounds; round++) {
      const budgetCheck = enforcer.checkBudget(executorState.budgetUsage);
      if (!budgetCheck.withinBudget) {
        this.log(state, "warn", `Budget exceeded for "${executor.name}": ${budgetCheck.message}`);
        break;
      }

      const result = await this.modelProvider.generate({
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

    this.log(state, "info",
      `Executor "${executor.name}" ${executorState.status} (${executorState.budgetUsage.runtimeSeconds.toFixed(1)}s)`,
    );
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    _executor: Executor,
    enforcer: PolicyEnforcer,
    executorState: ExecutorState,
    state: RunState,
  ): Promise<ChatMessage[]> {
    const results: ChatMessage[] = [];

    for (const tc of toolCalls) {
      executorState.budgetUsage.toolCalls++;

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

      try {
        const result = await this.toolInvoker.callTool(serverName, toolName, tc.arguments);
        this.log(state, "debug", `Tool ${tc.name} returned (isError: ${result.isError})`);

        results.push({
          role: "tool",
          toolCallId: tc.id,
          content: typeof result.content === "string"
            ? result.content
            : JSON.stringify(result.content),
        });
      } catch (err) {
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

    return state;
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
    executorState: ExecutorState,
    inputs: ResolvedInputs,
    stage: "seed" | "focus" | "deep",
    planOutput?: Record<string, unknown>,
  ): Promise<void> {
    const mounts = executorState.executor.mounts ?? [];
    const outputs = await this.hydrator.hydrateStage(mounts, stage, inputs, planOutput);
    executorState.mountOutputs.push(...outputs);
  }

  private buildMessages(
    executor: Executor,
    executorState: ExecutorState,
    taskOverride?: string,
  ): ChatMessage[] {
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

    const userContent = taskOverride
      ? `Task: ${taskOverride}\n\nAvailable data:\n${mountContext}`
      : `Execute your role using the following data:\n\n${mountContext}`;

    messages.push({
      role: "user",
      content: userContent,
    });

    return messages;
  }

  private async getAvailableTools(
    executor: Executor,
    _enforcer: PolicyEnforcer,
    _state: RunState,
  ): Promise<ToolDefinition[]> {
    if (!this.modelProvider.supportsToolCalling()) return [];

    const allowed = executor.policies?.toolAccess?.allow ?? [];
    if (allowed.length === 0) return [];

    const tools: ToolDefinition[] = [];

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
}
