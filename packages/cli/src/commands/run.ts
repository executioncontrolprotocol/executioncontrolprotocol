import { Flags, Args } from "@oclif/core";
import { resolve } from "node:path";
import ora from "ora";

import {
  BUILTIN_PLUGIN_VERSION,
  createDefaultSecretBroker,
  ECPEngine,
  loadContext,
  resolveInputs,
  resolveSystemConfig,
  MCPToolInvoker,
  A2AAgentTransport,
  ExtensionRegistry,
  registerBuiltinModelProviders,
  registerBuiltinLoggers,
  registerBuiltinPlugins,
  TraceCollector,
  ConsoleTraceExporter,
  JsonFileTraceExporter,
  type ECPSystemConfig,
  getSystemPluginPolicy,
} from "@executioncontrolprotocol/runtime";

import type { ECPContext, Orchestrator, Executor } from "@executioncontrolprotocol/spec";
import { getContextPlugins } from "@executioncontrolprotocol/spec";
import type {
  MemoryPluginInstance,
  ModelProvider,
  MemoryStore,
  ProgressCallback,
} from "@executioncontrolprotocol/plugins";

import { commandErrorMessage } from "../lib/command-helpers.js";
import { parseKeyValueInputs, splitCommaSeparated } from "../lib/parsing.js";
import { createProgressHandler } from "../lib/progress.js";
import { getDefaultTraceDir } from "../lib/ecp-home.js";
import { EcpEnvironmentCommand } from "../lib/ecp-environment-command.js";
import { resolveDotenvPathFromConfig, resolveSecretPolicyFromConfig } from "../lib/secrets-config.js";

function contextHasMemory(context: ECPContext): boolean {
  const visit = (orchestrator: Orchestrator): boolean => {
    if (orchestrator.memory) return true;
    for (const executor of orchestrator.executors ?? []) {
      if (executor.memory) return true;
    }
    for (const child of orchestrator.orchestrators ?? []) {
      if (visit(child)) return true;
    }
    return false;
  };
  if (context.orchestrator && visit(context.orchestrator)) return true;
  return (context.executors ?? []).some((e) => e.memory != null);
}

function inferModelProviderFromContext(context: ECPContext): string | undefined {
  const providers = new Set<string>();

  const visitExecutor = (executor: Executor): void => {
    const providerName = (executor.model as unknown as { provider?: { name?: string } })?.provider?.name;
    if (providerName) providers.add(providerName);
  };

  const visitOrchestrator = (orchestrator: Orchestrator): void => {
    for (const executor of orchestrator.executors ?? []) {
      visitExecutor(executor);
    }
    for (const child of orchestrator.orchestrators ?? []) {
      visitOrchestrator(child);
    }
  };

  if (context.orchestrator) visitOrchestrator(context.orchestrator);
  for (const executor of context.executors ?? []) {
    visitExecutor(executor);
  }

  if (providers.size === 1) return [...providers][0];
  if (providers.size === 0) return undefined;
  throw new Error(
    `Context declares multiple model providers (${[...providers].join(", ")}). Please pass --provider.`,
  );
}

export default class Run extends EcpEnvironmentCommand {
  static summary = "Execute a Context manifest";

  static flags = {
    ...EcpEnvironmentCommand.flags,
    input: Flags.string({
      char: "i",
      multiple: true,
      description: "Set an input value (repeatable, key=value)",
      summary: "Input value (key=value)",
    }),
    model: Flags.string({
      char: "m",
      description: "Override model name (must be allowed by system config policy)",
    }),
    provider: Flags.string({
      char: "p",
      description: "Override provider (must be allowed by system config policy)",
      options: ["openai", "ollama"] as const,
    }),
    config: Flags.string({
      char: "c",
      description:
        "Path to system config (YAML/JSON). Default: ./ecp.config.yaml, ./ecp.config.json, then ~/.ecp/ (see ecp config path)",
      default: "",
    }),
    trace: Flags.boolean({
      char: "t",
      description: "Enable tracing (saves to the user traces directory by default)",
      default: true,
      allowNo: true,
    }),
    "trace-dir": Flags.string({
      description: "Directory for trace files",
      default: getDefaultTraceDir(),
    }),
    logger: Flags.string({
      char: "l",
      multiple: true,
      multipleNonGreedy: true,
      description: "Enable a logger plugin (e.g. file). Repeatable or comma-separated.",
    }),
    debug: Flags.boolean({
      char: "d",
      description: "Enable debug logging",
      default: false,
    }),
  };

  static args = {
    contextPath: Args.string({
      required: true,
      description: "Path to context.yaml (or context.json)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Run);
    this.applyEnvironmentFlag(flags);

    const contextPath = resolve(args.contextPath);
    const inputs = (() => {
      try {
        return parseKeyValueInputs(flags.input as string[] | undefined, "--input");
      } catch (err) {
        this.error(commandErrorMessage(err), { exit: 1 });
      }
    })();

    const cwd = process.cwd();
    const systemConfig = (() => {
      try {
        return resolveSystemConfig(flags.config ? flags.config : undefined, cwd);
      } catch (err) {
        this.error(commandErrorMessage(err), { exit: 1 });
      }
    })();
    const loggerRaw = splitCommaSeparated(flags.logger as string[] | undefined);

    const context = loadContext(contextPath);

    let providerToUse: string | undefined;
    try {
      providerToUse = flags.provider ?? inferModelProviderFromContext(context);
    } catch (err) {
      this.error(commandErrorMessage(err), { exit: 1 });
    }

    if (!providerToUse) {
      this.error(
        'Model provider could not be inferred from the Context. Pass --provider openai|ollama.',
        { exit: 1 },
      );
    }

    this.assertProviderAllowedByPolicy(providerToUse, systemConfig);
    const selectedModel = flags.model;
    if (selectedModel) {
      this.assertModelAllowedByPolicy(providerToUse, selectedModel, systemConfig);
    }

    const enableFromConfig = getSystemPluginPolicy(systemConfig)?.defaultEnable ?? [];
    const enableForRun = [...new Set([...enableFromConfig, providerToUse])];

    const allowEnable = getSystemPluginPolicy(systemConfig)?.allowEnable;
    if (allowEnable && allowEnable.length > 0) {
      for (const id of enableForRun) {
        if (!allowEnable.includes(id)) {
          this.error(
            `Provider "${id}" cannot be used because it is not in system config plugins.allowEnable.\n` +
              `Allowed: ${allowEnable.join(", ")}\n` +
              `Update your config first (ecp.config.yaml / ecp config) and rerun.`,
            { exit: 1 },
          );
        }
      }
    }

    const dotenvPath = this.effectiveDotenvPath ?? resolveDotenvPathFromConfig(cwd, systemConfig);
    const { broker: secretBroker } = createDefaultSecretBroker({
      policy: resolveSecretPolicyFromConfig(systemConfig),
      dotenvPath,
      cwd,
    });

    const registry = new ExtensionRegistry();
    const openaiDefaults = systemConfig?.modelProviders?.openai ?? {};
    const ollamaDefaults = systemConfig?.modelProviders?.ollama ?? {};
    registerBuiltinModelProviders(registry, {
      version: BUILTIN_PLUGIN_VERSION,
      openai: { defaultModel: selectedModel ?? openaiDefaults.defaultModel },
      ollama: {
        baseURL: ollamaDefaults.baseURL,
        defaultModel: selectedModel ?? ollamaDefaults.defaultModel,
      },
    });
    registerBuiltinLoggers(registry, { version: BUILTIN_PLUGIN_VERSION, file: {} });
    registerBuiltinPlugins(registry, { version: BUILTIN_PLUGIN_VERSION });
    registry.lock();

    const modelProvider = this.createModelProviderOrFail(registry, providerToUse);

    const toolInvoker = new MCPToolInvoker();
    const agentTransport = new A2AAgentTransport();

    const toolServers = systemConfig?.toolServers;

    if (ollamaDefaults.baseURL) {
      try {
        new URL(ollamaDefaults.baseURL);
      } catch {
        this.error(
          `Invalid modelProviders.ollama.baseURL in system config: "${ollamaDefaults.baseURL}"`,
          { exit: 1 },
        );
      }
    }

    const loggerCallbacks: ProgressCallback[] = [];
    const loggersConfig = systemConfig?.loggers;
    const loggersEnabled = loggerRaw.length > 0 ? loggerRaw : loggersConfig?.defaultEnable ?? [];
    const loggersAllow = loggersConfig?.allowEnable;
    if (loggersAllow && loggersAllow.length > 0) {
      for (const id of loggersEnabled) {
        if (!loggersAllow.includes(id)) {
          this.error(
            `Logger "${id}" is not in system config loggers.allowEnable. Allowed: ${loggersAllow.join(
              ", ",
            )}`,
            { exit: 1 },
          );
        }
      }
    }
    for (const id of loggersEnabled) {
      try {
        const cb = registry.createLogger(id, loggersConfig?.config?.[id]);
        loggerCallbacks.push(cb);
      } catch (err) {
        this.error(`Failed to create logger "${id}": ${commandErrorMessage(err)}`, { exit: 1 });
      }
    }

    const spinner = flags.debug ? undefined : ora({ stream: process.stderr }).start("Loading context...");
    const builtInProgress = spinner
      ? createProgressHandler(spinner, contextPath, context.metadata.name)
      : undefined;

    const onProgress: ProgressCallback | ProgressCallback[] | undefined =
      builtInProgress && loggerCallbacks.length > 0
        ? [builtInProgress, ...loggerCallbacks]
        : builtInProgress ?? (loggerCallbacks.length > 0 ? loggerCallbacks : undefined);

    if (flags.debug) {
      console.log(`\n  Running: ${contextPath}\n`);
    }

    // Keep memory-store lifecycle in the CLI so we can close it after a run.
    let memoryStore: MemoryStore | undefined;
    if (contextHasMemory(context)) {
      const pluginReg = registry.listPlugins().find((p) => p.id === "memory");
      if (pluginReg) {
        try {
          const instance = pluginReg.create(getContextPlugins(context)?.config?.memory as Record<string, unknown>) as MemoryPluginInstance;
          memoryStore = await instance.open();
        } catch (err) {
          if (flags.debug) {
            console.error(`  Memory plugin open failed: ${commandErrorMessage(err)}\n`);
          }
        }
      }
    }

    const engine = new ECPEngine(modelProvider, toolInvoker, agentTransport, {
      toolServers,
      secretBroker,
      agentEndpoints: systemConfig?.agentEndpoints,
      defaultModel: selectedModel ?? openaiDefaults.defaultModel ?? ollamaDefaults.defaultModel,
      modelOverride: selectedModel,
      debug: flags.debug,
      trace: flags.trace,
      memoryStore,
      onProgress,
      plugins: {
        registry,
        enable: enableForRun,
        allowEnable: getSystemPluginPolicy(systemConfig)?.allowEnable,
        security: getSystemPluginPolicy(systemConfig)?.security ?? getContextPlugins(context)?.security,
      },
    });

    if (flags.trace) {
      const collector = new TraceCollector();
      collector.addExporters(
        new ConsoleTraceExporter(),
        new JsonFileTraceExporter({ outputDir: flags["trace-dir"] }),
      );
      engine.setTraceCollector(collector);
    }

    let resolvedInputs: typeof inputs;
    try {
      resolvedInputs = resolveInputs(context, inputs) as typeof inputs;
    } catch (err) {
      const msg = commandErrorMessage(err);
      const missing = msg.match(/^Missing required input: "([^"]+)"$/);
      if (missing) {
        const inputName = missing[1];
        this.error(
          `\n  Error: Missing required input "${inputName}" defined in the Context manifest.\n` +
            `  Provide it via --input ${inputName}=<value> (e.g. -i ${inputName}="...").\n`,
          { exit: 1 },
        );
      }
      throw err;
    }

    const result = await engine.run({ context, inputs: resolvedInputs });

    if (memoryStore && typeof memoryStore.close === "function") {
      await memoryStore.close();
    }

    if (spinner) {
      if (result.success) spinner.succeed("Execution completed.");
      else spinner.fail("Execution failed.");
    }

    console.log("\n--- Execution Result ---");
    console.log(`  Run ID:     ${result.runId}`);
    console.log(`  Context:    ${result.contextName} v${result.contextVersion}`);
    console.log(`  Success:    ${result.success}`);
    console.log(`  Duration:   ${result.durationMs}ms`);
    console.log(`  Tool calls: ${result.totalBudgetUsage.toolCalls}`);

    if (result.error) {
      console.log(`  Error:      ${result.error}`);
    }

    if (result.output) {
      console.log("\n--- Output ---");
      console.log(JSON.stringify(result.output, null, 2));
    }

    if (!spinner) {
      console.log("\n--- Executor Outputs ---");
      for (const [name, output] of Object.entries(result.executorOutputs)) {
        console.log(`\n  [${name}]`);
        console.log(JSON.stringify(output, null, 2));
      }
    }

    if (flags.debug) {
      console.log("\n--- Execution Log ---");
      for (const entry of result.log) {
        console.log(`  [${entry.level.toUpperCase().padEnd(5)}] ${entry.message}`);
      }
    }

    if (flags.trace) {
      console.log(`\n  Trace saved to: ${flags["trace-dir"]}/${result.runId}.json`);
      console.log(`  View with: ecp trace ${result.runId}`);
      console.log(`  Graph with: ecp trace --output graph ${result.runId}`);
    }

    this.exit(result.success ? 0 : 1);
  }

  private createModelProviderOrFail(registry: ExtensionRegistry, providerId: string): ModelProvider {
    const registration = registry.getModelProviderRegistration(providerId);
    if (!registration) {
      const known = registry.listModelProviders().map((p) => p.id).join(", ");
      this.error(`Unknown provider "${providerId}". Registered providers: ${known}`, { exit: 1 });
    }

    try {
      return registry.createModelProvider(providerId);
    } catch (err) {
      const rawMsg = commandErrorMessage(err);
      const hint = err && typeof err === "object" && "hint" in err ? (err as { hint?: string }).hint : undefined;
      this.error(
        `${rawMsg}${hint ? `\n${hint}` : ""}`,
        { exit: 1 },
      );
    }
  }

  private assertProviderAllowedByPolicy(providerId: string, systemConfig?: ECPSystemConfig): void {
    const allowEnable = getSystemPluginPolicy(systemConfig)?.allowEnable;
    if (allowEnable?.length && !allowEnable.includes(providerId)) {
      this.error(
        `Provider "${providerId}" is blocked by system config plugins.allowEnable.\n` +
          `Allowed: ${allowEnable.join(", ")}\n` +
          `Update your config first (ecp.config.yaml / ecp config) and rerun.`,
        { exit: 1 },
      );
    }

    const allowIds = getSystemPluginPolicy(systemConfig)?.security?.allowIds;
    if (allowIds?.length && !allowIds.includes(providerId)) {
      this.error(
        `Provider "${providerId}" is blocked by system config plugins.security.allowIds.\n` +
          `Allowed IDs: ${allowIds.join(", ")}\n` +
          `Update your config first (ecp.config.yaml / ecp config) and rerun.`,
        { exit: 1 },
      );
    }
  }

  private assertModelAllowedByPolicy(
    providerId: string,
    modelName: string,
    systemConfig?: ECPSystemConfig,
  ): void {
    const allowedModels = systemConfig?.modelProviders?.[providerId as "openai" | "ollama"]?.allowedModels;
    if (allowedModels?.length && !allowedModels.includes(modelName)) {
      this.error(
        `Model "${modelName}" is blocked for provider "${providerId}" by system config modelProviders.${providerId}.allowedModels.\n` +
          `Allowed models: ${allowedModels.join(", ")}\n` +
          `Update your config first (ecp.config.yaml / ecp config) and rerun.`,
        { exit: 1 },
      );
    }
  }
}

