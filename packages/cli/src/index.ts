#!/usr/bin/env tsx
/**
 * ECP CLI — run Context manifests from the command line.
 *
 * Usage:
 *   ecp run <context.yaml> [--input key=value ...] [--debug] [--model <model>] [--trace]
 *   ecp validate <context.yaml>
 *   ecp trace <run_id>
 *   ecp graph <run_id>
 *
 * @category CLI
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import ora from "ora";
import { ECPEngine, loadContext, resolveInputs, resolveSystemConfig } from "@ecp/runtime";
import type { ModelProvider, ExecutionProgressEvent, ProgressCallback } from "@ecp/runtime";
import { MCPToolInvoker } from "@ecp/runtime";
import { A2AAgentTransport } from "@ecp/runtime";
import { ExtensionRegistry, registerBuiltinModelProviders, registerBuiltinProgressLoggers, registerBuiltinPlugins } from "@ecp/runtime";
import {
  TraceCollector,
  ConsoleTraceExporter,
  JsonFileTraceExporter,
  formatTrace,
  renderGraph,
} from "@ecp/runtime";
import type { ExecutionTrace } from "@ecp/runtime";
import type { MemoryStoreLike } from "@ecp/runtime";
import type { ECPContext, ExtensionSecurityPolicy, Orchestrator } from "@ecp/spec";

interface ParsedArgs {
  command: string;
  contextPath: string;
  inputs: Record<string, string | number | boolean>;
  debug: boolean;
  trace: boolean;
  traceDir: string;
  model?: string;
  provider: string;
  enable: string[];
  configPath: string;
  ollamaBaseUrl: string;
  toolServers: string;
  agentEndpoints: string;
  extensionSecurity: string;
  progressLogger: string[];
}

function collectExecutionObjectNames(context: ECPContext): string[] {
  const names = new Set<string>();
  const addName = (name: string): void => {
    names.add(name);
  };

  const visitOrchestrator = (orchestrator: Orchestrator): void => {
    addName(orchestrator.name);
    for (const executor of orchestrator.executors ?? []) {
      addName(executor.name);
    }
    for (const child of orchestrator.orchestrators ?? []) {
      visitOrchestrator(child);
    }
  };

  if (context.orchestrator) {
    visitOrchestrator(context.orchestrator);
  }
  for (const executor of context.executors ?? []) {
    addName(executor.name);
  }

  return [...names];
}

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

function phaseToLabel(status: string): string {
  const labels: Record<string, string> = {
    loading: "Loading context...",
    "hydrating-seed": "Hydrating seed mounts...",
    "running-orchestrator": "Running orchestrator...",
    delegating: "Delegating tasks...",
    "hydrating-focus": "Hydrating focus mounts...",
    "hydrating-deep": "Hydrating deep mounts...",
    "running-specialist": "Running specialist...",
    merging: "Merging outputs...",
    completed: "Completed.",
    failed: "Failed.",
  };
  return labels[status] ?? status;
}

function createProgressHandler(
  spinner: ReturnType<typeof ora>,
  contextPath: string,
  contextName: string,
): (event: ExecutionProgressEvent) => void | Promise<void> {
  let currentText = "Starting...";
  const completedSteps: Array<{
    step: number;
    executorName: string;
    description: string;
    durationMs: number;
    tokens?: { prompt: number; completion: number; total: number };
    model?: string;
    output?: unknown;
  }> = [];

  function redraw(): void {
    const isTTY = process.stderr.isTTY;
    if (isTTY) {
      process.stderr.write("\x1b[2J\x1b[H");
    }
    process.stderr.write(`\n  Running: ${contextPath}\n`);
    process.stderr.write(`  Context: ${contextName}\n\n`);
    for (const s of completedSteps) {
      process.stderr.write(`  Step ${s.step}: ${s.description} (${s.durationMs}ms)\n`);
      if (s.model) {
        process.stderr.write(`    Model: ${s.model}\n`);
      }
      if (s.tokens && s.tokens.total > 0) {
        process.stderr.write(
          `    Tokens: ${s.tokens.prompt} prompt + ${s.tokens.completion} completion = ${s.tokens.total} total\n`,
        );
      }
      if (s.output !== undefined) {
        process.stderr.write(`    Output:\n`);
        const json = JSON.stringify(s.output, null, 2);
        for (const line of json.split(/\r?\n/)) {
          process.stderr.write(`      ${line}\n`);
        }
      }
      process.stderr.write("\n");
    }
    spinner.start(currentText);
  }

  function appendLastStep(): void {
    const s = completedSteps[completedSteps.length - 1];
    if (!s) return;
    spinner.stopAndPersist({
      text: `Step ${s.step}: ${s.description} (${s.durationMs}ms)`,
    });
    process.stderr.write(`    Model: ${s.model ?? "n/a"}\n`);
    if (s.tokens && s.tokens.total > 0) {
      process.stderr.write(
        `    Tokens: ${s.tokens.prompt} prompt + ${s.tokens.completion} completion = ${s.tokens.total} total\n`,
      );
    }
    if (s.output !== undefined) {
      process.stderr.write(`    Output:\n`);
      const json = JSON.stringify(s.output, null, 2);
      for (const line of json.split(/\r?\n/)) {
        process.stderr.write(`      ${line}\n`);
      }
    }
    process.stderr.write("\n");
    spinner.start(currentText);
  }

  return async (event: ExecutionProgressEvent) => {
    switch (event.type) {
      case "phase":
        currentText = phaseToLabel(event.status);
        spinner.text = currentText;
        break;
      case "step_start":
        currentText = event.description;
        spinner.text = currentText;
        break;
      case "step_complete":
        if (event.kind === "executor") {
          completedSteps.push({
            step: event.step,
            executorName: event.executorName ?? "",
            description: event.description,
            durationMs: event.durationMs,
            tokens: event.tokens,
            model: event.model,
            output: event.output,
          });
          spinner.stop();
          if (process.stderr.isTTY) {
            redraw();
          } else {
            appendLastStep();
          }
        }
        break;
      case "executor_reasoning":
        spinner.stop();
        const lines = event.reasoning.split(/\r?\n/);
        process.stderr.write(`\n  [${event.executorName}] Chain of thought:\n`);
        for (const line of lines) {
          process.stderr.write(`    ${line}\n`);
        }
        process.stderr.write("\n");
        spinner.start(currentText);
        break;
    }
  };
}

function printUsage(): void {
  console.log(`
ECP CLI — Execution Control Protocol runner

Usage:
  ecp run <context.yaml>      Execute a Context manifest
  ecp validate <context.yaml>  Validate a Context manifest
  ecp trace <run_id>           Display execution trace
  ecp graph <run_id>           Display execution graph

Options:
  --input, -i <key=value>    Set an input value (repeatable)
  --model, -m <model>        Override the default model (e.g. gpt-4o-mini)
  --provider, -p <name>      Model provider: openai (default) or ollama
  --enable, -e <id>         Extension(s) to enable for this run (repeatable or comma-separated). Overrides system config defaultEnable.
  --config, -c <path>        Path to system config (ecp.config.yaml). Default: ./ecp.config.yaml then ~/.ecp/config.yaml
  --ollama-base-url <url>   Ollama server URL (default: http://localhost:11434)
  --trace, -t               Enable tracing (saves to ./traces/<run_id>.json)
  --trace-dir <dir>         Directory for trace files (default: ./traces)
  --progress-logger <id>    Enable a progress logger (e.g. file). Repeatable. Uses config from ~/.ecp/config.yaml
  --extension-security <json> JSON security policy for extension loading
  --tool-servers <json>     JSON map of tool server configs
  --agent-endpoints <json>  JSON map of agent endpoints
  --debug, -d               Enable debug logging
  --help, -h                Show this help message

Examples:
  ecp run spec.yaml --input shopifyStoreId=store-123 --trace
  ecp trace run-1234567890-abc123
  ecp graph run-1234567890-abc123
`);
}

function parseCliArgs(): ParsedArgs {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string", short: "i", multiple: true },
      model: { type: "string", short: "m" },
      provider: { type: "string", short: "p", default: "openai" },
      enable: { type: "string", short: "e", multiple: true },
      config: { type: "string", short: "c" },
      "ollama-base-url": { type: "string", default: "http://localhost:11434" },
      trace: { type: "boolean", short: "t", default: false },
      "trace-dir": { type: "string", default: "./traces" },
      "progress-logger": { type: "string", short: "l", multiple: true },
      debug: { type: "boolean", short: "d", default: false },
      help: { type: "boolean", short: "h", default: false },
      "tool-servers": { type: "string", default: "" },
      "agent-endpoints": { type: "string", default: "" },
      "extension-security": { type: "string", default: "" },
    },
  });

  const enableRaw = (values.enable as string[] | undefined) ?? [];
  const enable: string[] = [];
  for (const v of enableRaw) {
    enable.push(...v.split(",").map((s) => s.trim()).filter(Boolean));
  }

  if (values.help || positionals.length === 0) {
    printUsage();
    process.exit(0);
  }

  const command = positionals[0];
  const rawArg = positionals[1] ?? "";
  const contextPath = rawArg && (command === "run" || command === "validate")
    ? resolve(rawArg) : rawArg;

  const inputs: Record<string, string | number | boolean> = {};
  for (const kv of (values.input as string[] | undefined) ?? []) {
    const eqIdx = kv.indexOf("=");
    if (eqIdx === -1) {
      console.error(`Invalid input format: "${kv}" (expected key=value)`);
      process.exit(1);
    }
    const key = kv.slice(0, eqIdx);
    const rawValue = kv.slice(eqIdx + 1);

    if (rawValue === "true") inputs[key] = true;
    else if (rawValue === "false") inputs[key] = false;
    else if (!isNaN(Number(rawValue)) && rawValue !== "") inputs[key] = Number(rawValue);
    else inputs[key] = rawValue;
  }

  return {
    command,
    contextPath,
    inputs,
    debug: values.debug as boolean,
    trace: values.trace as boolean,
    traceDir: (values["trace-dir"] as string) ?? "./traces",
    model: values.model as string | undefined,
    provider: (values.provider as string) ?? "openai",
    enable,
    configPath: (values.config as string) ?? "",
    ollamaBaseUrl: (values["ollama-base-url"] as string) ?? "http://localhost:11434",
    toolServers: (values["tool-servers"] as string) ?? "",
    agentEndpoints: (values["agent-endpoints"] as string) ?? "",
    extensionSecurity: (values["extension-security"] as string) ?? "",
    progressLogger: ((values["progress-logger"] as string[] | undefined) ?? []).flatMap((v) =>
      v.split(",").map((s) => s.trim()).filter(Boolean),
    ),
  };
}

async function runValidate(args: ParsedArgs): Promise<void> {
  console.log(`\nValidating: ${args.contextPath}\n`);

  try {
    const context = loadContext(args.contextPath);
    resolveInputs(context, args.inputs);
    const strategy = context.orchestration?.strategy ?? context.orchestrator?.strategy;
    const executionObjectNames = collectExecutionObjectNames(context);

    console.log(`  Context: ${context.metadata.name} v${context.metadata.version}`);
    console.log(`  Strategy: ${strategy ?? "unknown"}`);
    console.log(`  Execution objects: ${executionObjectNames.join(", ")}`);
    console.log(`  Schemas: ${Object.keys(context.schemas ?? {}).join(", ")}`);
    console.log(`\n  Validation passed.\n`);
  } catch (err) {
    console.error(`\n  Validation failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

async function runExecute(args: ParsedArgs): Promise<void> {
  const context = loadContext(args.contextPath);
  const cwd = process.cwd();
  const systemConfig = resolveSystemConfig(
    args.configPath || undefined,
    cwd,
  );

  const enableFromCli = args.enable.length > 0
    ? args.enable
    : systemConfig?.extensions?.defaultEnable ?? [args.provider];
  const allowEnable = systemConfig?.extensions?.allowEnable;
  if (allowEnable !== undefined && allowEnable.length > 0) {
    for (const id of enableFromCli) {
      if (!allowEnable.includes(id)) {
        console.error(
          `\n  Extension "${id}" is not in system config allowEnable. Allowed: ${allowEnable.join(", ")}\n`,
        );
        process.exit(1);
      }
    }
  }

  const registry = new ExtensionRegistry();
  registerBuiltinModelProviders(registry, {
    version: "0.3.0",
    openai: {
      defaultModel: args.model,
    },
    ollama: {
      baseURL: args.ollamaBaseUrl,
      defaultModel: args.model,
    },
  });
  registerBuiltinProgressLoggers(registry, {
    version: "0.3.0",
    file: {},
  });
  registerBuiltinPlugins(registry, { version: "0.3.0" });
  registry.lock();

  let modelProvider: ModelProvider;
  try {
    modelProvider = registry.createModelProvider(args.provider);
  } catch {
    console.error(
      `\n  Unknown provider "${args.provider}". Registered providers: ${registry.listModelProviders().map((p) => p.id).join(", ")}\n`,
    );
    process.exit(1);
  }

  const toolInvoker = new MCPToolInvoker();
  const agentTransport = new A2AAgentTransport();

  const toolServers = args.toolServers
    ? JSON.parse(args.toolServers) as Record<string, { transport: Record<string, unknown> }>
    : undefined;

  const agentEndpoints = args.agentEndpoints
    ? JSON.parse(args.agentEndpoints) as Record<string, string>
    : undefined;

  const extensionSecurity = args.extensionSecurity
    ? JSON.parse(args.extensionSecurity) as ExtensionSecurityPolicy
    : (systemConfig?.extensions?.security ?? context.extensions?.security);

  const progressLoggerCallbacks: ProgressCallback[] = [];
  const plConfig = systemConfig?.progressLoggers;
  const plEnable =
    args.progressLogger.length > 0 ? args.progressLogger : plConfig?.defaultEnable ?? [];
  const plAllow = plConfig?.allowEnable;
  if (plAllow !== undefined && plAllow.length > 0) {
    for (const id of plEnable) {
      if (!plAllow.includes(id)) {
        console.error(
          `\n  Progress logger "${id}" is not in system config progressLoggers.allowEnable. Allowed: ${plAllow.join(", ")}\n`,
        );
        process.exit(1);
      }
    }
  }
  for (const id of plEnable) {
    try {
      const cb = registry.createProgressLogger(id, plConfig?.config?.[id]);
      progressLoggerCallbacks.push(cb);
    } catch (err) {
      console.error(
        `\n  Failed to create progress logger "${id}": ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    }
  }

  const spinner = args.debug ? undefined : ora({ stream: process.stderr }).start("Loading context...");
  const builtInProgress = spinner
    ? createProgressHandler(spinner, args.contextPath, context.metadata.name)
    : undefined;
  const onProgress: ProgressCallback | ProgressCallback[] | undefined =
    builtInProgress && progressLoggerCallbacks.length > 0
      ? [builtInProgress, ...progressLoggerCallbacks]
      : builtInProgress ?? (progressLoggerCallbacks.length > 0 ? progressLoggerCallbacks : undefined);

  if (args.debug) {
    console.log(`\n  Running: ${args.contextPath}\n`);
  }

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
        if (args.debug) {
          console.error(`  Memory plugin open failed: ${err instanceof Error ? err.message : String(err)}\n`);
        }
      }
    }
  }

  const engine = new ECPEngine(modelProvider, toolInvoker, agentTransport, {
    toolServers,
    agentEndpoints,
    defaultModel: args.model,
    modelOverride: args.model,
    debug: args.debug,
    trace: args.trace,
    memoryStore,
    onProgress,
    extensions: {
      registry,
      enable: enableFromCli,
      allowEnable: systemConfig?.extensions?.allowEnable,
      security: extensionSecurity,
    },
  });

  if (args.trace) {
    const collector = new TraceCollector();
    collector.addExporters(
      new ConsoleTraceExporter(),
      new JsonFileTraceExporter({ outputDir: args.traceDir }),
    );
    engine.setTraceCollector(collector);
  }

  const result = await engine.run({
    context,
    inputs: args.inputs,
  });

  if (memoryStore && typeof memoryStore.close === "function") {
    await memoryStore.close();
  }

  if (spinner) {
    if (result.success) {
      spinner.succeed("Execution completed.");
    } else {
      spinner.fail("Execution failed.");
    }
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

  if (args.debug) {
    console.log("\n--- Execution Log ---");
    for (const entry of result.log) {
      console.log(`  [${entry.level.toUpperCase().padEnd(5)}] ${entry.message}`);
    }
  }

  if (args.trace) {
    console.log(`\n  Trace saved to: ${args.traceDir}/${result.runId}.json`);
    console.log(`  View with: ecp trace ${result.runId}`);
    console.log(`  Graph with: ecp graph ${result.runId}`);
  }

  console.log("");
  process.exit(result.success ? 0 : 1);
}

function loadTrace(runId: string, traceDir: string): ExecutionTrace {
  const filePath = resolve(traceDir, `${runId}.json`);
  if (!existsSync(filePath)) {
    console.error(`\n  Trace not found: ${filePath}`);
    console.error(`  Run with --trace to generate: ecp run <context.yaml> --trace\n`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(filePath, "utf-8")) as ExecutionTrace;
}

async function runTrace(args: ParsedArgs): Promise<void> {
  const runId = args.contextPath || "";
  if (!runId) {
    console.error("Error: run ID is required\nUsage: ecp trace <run_id>");
    process.exit(1);
  }
  const trace = loadTrace(runId, args.traceDir);
  console.log(formatTrace(trace));
}

async function runGraph(args: ParsedArgs): Promise<void> {
  const runId = args.contextPath || "";
  if (!runId) {
    console.error("Error: run ID is required\nUsage: ecp graph <run_id>");
    process.exit(1);
  }
  const trace = loadTrace(runId, args.traceDir);
  console.log(renderGraph(trace));
}

async function main(): Promise<void> {
  const args = parseCliArgs();

  switch (args.command) {
    case "run":
      await runExecute(args);
      break;
    case "validate":
      await runValidate(args);
      break;
    case "trace":
      await runTrace(args);
      break;
    case "graph":
      await runGraph(args);
      break;
    default:
      console.error(`Unknown command: "${args.command}"`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
