import { Command, Flags, Args } from "@oclif/core";
import { resolve } from "node:path";
import ora from "ora";

import {
  ECPEngine,
  loadContext,
  resolveInputs,
  resolveSystemConfig,
  MCPToolInvoker,
  A2AAgentTransport,
  ExtensionRegistry,
  registerBuiltinModelProviders,
  registerBuiltinProgressLoggers,
  registerBuiltinPlugins,
  TraceCollector,
  ConsoleTraceExporter,
  JsonFileTraceExporter,
  type ProgressCallback,
} from "@executioncontrolprotocol/runtime";

import type { ECPContext, ExtensionSecurityPolicy, Orchestrator, Executor } from "@executioncontrolprotocol/spec";
import type { ModelProvider, MemoryStoreLike } from "@executioncontrolprotocol/runtime";

import { parseKeyValueInputs, splitCommaSeparated, parseJsonObject } from "../lib/parsing.js";
import { createProgressHandler } from "../lib/progress.js";
import { getDefaultTraceDir } from "../lib/ecp-home.js";

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

export default class Run extends Command {
  static summary = "Execute a Context manifest";

  static flags = {
    input: Flags.string({
      char: "i",
      multiple: true,
      description: "Set an input value (repeatable, key=value)",
      summary: "Input value (key=value)",
    }),
    model: Flags.string({
      char: "m",
      description: "Override the default model (e.g. gpt-4o-mini)",
    }),
    provider: Flags.string({
      char: "p",
      description: "Model provider: openai or ollama",
      options: ["openai", "ollama"] as const,
    }),
    enable: Flags.string({
      char: "e",
      multiple: true,
      multipleNonGreedy: true,
      description:
        "Extension(s) to enable for this run (repeatable or comma-separated). Overrides system config defaultEnable.",
    }),
    config: Flags.string({
      char: "c",
      description: "Path to system config (ecp.config.yaml). Default: ./ecp.config.yaml then ~/.ecp/config.yaml",
      default: "",
    }),
    "ollama-base-url": Flags.string({
      description: "Ollama server URL",
      default: "http://localhost:11434",
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
    "progress-logger": Flags.string({
      char: "l",
      multiple: true,
      multipleNonGreedy: true,
      description: "Enable a progress logger (e.g. file). Repeatable or comma-separated.",
    }),
    "extension-security": Flags.string({
      description: "JSON security policy for extension loading",
      default: "",
    }),
    "agent-endpoints": Flags.string({
      description: "JSON map of agent endpoints",
      default: "",
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

    const contextPath = resolve(args.contextPath);
    const inputs = (() => {
      try {
        return parseKeyValueInputs(flags.input as string[] | undefined, "--input");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.error(msg, { exit: 1 });
      }
    })();

    const cwd = process.cwd();
    const systemConfig = (() => {
      try {
        return resolveSystemConfig(flags.config ? flags.config : undefined, cwd);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.error(msg, { exit: 1 });
      }
    })();
    const enableRaw = splitCommaSeparated(flags.enable as string[] | undefined);
    const progressLoggerRaw = splitCommaSeparated(flags["progress-logger"] as string[] | undefined);

    const context = loadContext(contextPath);

    let providerToUse: string | undefined;
    try {
      providerToUse = flags.provider ?? inferModelProviderFromContext(context);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(msg, { exit: 1 });
    }

    if (!providerToUse) {
      this.error(
        'Model provider could not be inferred from the Context. Pass --provider openai|ollama.',
        { exit: 1 },
      );
    }

    const enableFromCli =
      enableRaw.length > 0 ? enableRaw : systemConfig?.extensions?.defaultEnable ?? [providerToUse];

    const allowEnable = systemConfig?.extensions?.allowEnable;
    if (allowEnable && allowEnable.length > 0) {
      for (const id of enableFromCli) {
        if (!allowEnable.includes(id)) {
          this.error(
            `Extension "${id}" is not in system config allowEnable. Allowed: ${allowEnable.join(", ")}`,
            { exit: 1 },
          );
        }
      }
    }

    const registry = new ExtensionRegistry();
    registerBuiltinModelProviders(registry, {
      version: "0.3.0",
      openai: { defaultModel: flags.model },
      ollama: { baseURL: flags["ollama-base-url"], defaultModel: flags.model },
    });
    registerBuiltinProgressLoggers(registry, { version: "0.3.0", file: {} });
    registerBuiltinPlugins(registry, { version: "0.3.0" });
    registry.lock();

    const modelProvider = this.createModelProviderOrFail(registry, providerToUse);

    const toolInvoker = new MCPToolInvoker();
    const agentTransport = new A2AAgentTransport();

    const toolServers = systemConfig?.toolServers;

    try {
      // eslint-disable-next-line no-new
      new URL(flags["ollama-base-url"]);
    } catch {
      this.error(`Invalid --ollama-base-url: "${flags["ollama-base-url"]}" is not a valid URL.`, { exit: 1 });
    }

    const agentEndpoints = (() => {
      if (!flags["agent-endpoints"]) return undefined;
      try {
        return parseJsonObject<Record<string, string>>(flags["agent-endpoints"], "--agent-endpoints");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.error(msg, { exit: 1 });
      }
    })();

    const extensionSecurity = (() => {
      if (!flags["extension-security"]) return systemConfig?.extensions?.security ?? context.extensions?.security;
      try {
        return parseJsonObject<ExtensionSecurityPolicy>(
          flags["extension-security"],
          "--extension-security",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.error(msg, { exit: 1 });
      }
    })();

    const progressLoggerCallbacks: ProgressCallback[] = [];
    const plConfig = systemConfig?.progressLoggers;
    const plEnable = progressLoggerRaw.length > 0 ? progressLoggerRaw : plConfig?.defaultEnable ?? [];
    const plAllow = plConfig?.allowEnable;
    if (plAllow && plAllow.length > 0) {
      for (const id of plEnable) {
        if (!plAllow.includes(id)) {
          this.error(
            `Progress logger "${id}" is not in system config progressLoggers.allowEnable. Allowed: ${plAllow.join(
              ", ",
            )}`,
            { exit: 1 },
          );
        }
      }
    }
    for (const id of plEnable) {
      try {
        const cb = registry.createProgressLogger(id, plConfig?.config?.[id]);
        progressLoggerCallbacks.push(cb);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.error(`Failed to create progress logger "${id}": ${msg}`, { exit: 1 });
      }
    }

    const spinner = flags.debug ? undefined : ora({ stream: process.stderr }).start("Loading context...");
    const builtInProgress = spinner
      ? createProgressHandler(spinner, contextPath, context.metadata.name)
      : undefined;

    const onProgress: ProgressCallback | ProgressCallback[] | undefined =
      builtInProgress && progressLoggerCallbacks.length > 0
        ? [builtInProgress, ...progressLoggerCallbacks]
        : builtInProgress ?? (progressLoggerCallbacks.length > 0 ? progressLoggerCallbacks : undefined);

    if (flags.debug) {
      // eslint-disable-next-line no-console
      console.log(`\n  Running: ${contextPath}\n`);
    }

    // Keep memory-store lifecycle in the CLI so we can close it after a run.
    let memoryStore: MemoryStoreLike | undefined;
    if (contextHasMemory(context)) {
      const pluginReg = registry.listPlugins().find((p) => p.id === "memory");
      if (pluginReg) {
        try {
          const instance = pluginReg.create(context.extensions?.config?.memory as Record<string, unknown>) as {
            open(): Promise<MemoryStoreLike>;
          };
          memoryStore = await instance.open();
        } catch (err) {
          if (flags.debug) {
            const msg = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.error(`  Memory plugin open failed: ${msg}\n`);
          }
        }
      }
    }

    const engine = new ECPEngine(modelProvider, toolInvoker, agentTransport, {
      toolServers,
      agentEndpoints,
      defaultModel: flags.model,
      modelOverride: flags.model,
      debug: flags.debug,
      trace: flags.trace,
      memoryStore,
      onProgress,
      extensions: {
        registry,
        enable: enableFromCli,
        allowEnable: systemConfig?.extensions?.allowEnable,
        security: extensionSecurity,
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
      const msg = err instanceof Error ? err.message : String(err);
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

    // eslint-disable-next-line no-console
    console.log("\n--- Execution Result ---");
    // eslint-disable-next-line no-console
    console.log(`  Run ID:     ${result.runId}`);
    // eslint-disable-next-line no-console
    console.log(`  Context:    ${result.contextName} v${result.contextVersion}`);
    // eslint-disable-next-line no-console
    console.log(`  Success:    ${result.success}`);
    // eslint-disable-next-line no-console
    console.log(`  Duration:   ${result.durationMs}ms`);
    // eslint-disable-next-line no-console
    console.log(`  Tool calls: ${result.totalBudgetUsage.toolCalls}`);

    if (result.error) {
      // eslint-disable-next-line no-console
      console.log(`  Error:      ${result.error}`);
    }

    if (result.output) {
      // eslint-disable-next-line no-console
      console.log("\n--- Output ---");
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result.output, null, 2));
    }

    if (!spinner) {
      // eslint-disable-next-line no-console
      console.log("\n--- Executor Outputs ---");
      for (const [name, output] of Object.entries(result.executorOutputs)) {
        // eslint-disable-next-line no-console
        console.log(`\n  [${name}]`);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(output, null, 2));
      }
    }

    if (flags.debug) {
      // eslint-disable-next-line no-console
      console.log("\n--- Execution Log ---");
      for (const entry of result.log) {
        // eslint-disable-next-line no-console
        console.log(`  [${entry.level.toUpperCase().padEnd(5)}] ${entry.message}`);
      }
    }

    if (flags.trace) {
      // eslint-disable-next-line no-console
      console.log(`\n  Trace saved to: ${flags["trace-dir"]}/${result.runId}.json`);
      // eslint-disable-next-line no-console
      console.log(`  View with: ecp trace ${result.runId}`);
      // eslint-disable-next-line no-console
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
      const rawMsg = err instanceof Error ? err.message : String(err);
      const hint = err && typeof err === "object" && "hint" in err ? (err as { hint?: string }).hint : undefined;
      this.error(
        `${rawMsg}${hint ? `\n${hint}` : ""}`,
        { exit: 1 },
      );
    }
  }
}

