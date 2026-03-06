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
import { ECPEngine, loadContext, resolveInputs } from "@ecp/runtime";
import { OpenAIProvider, OllamaProvider } from "@ecp/runtime";
import type { ModelProvider } from "@ecp/runtime";
import { MCPToolInvoker } from "@ecp/runtime";
import { A2AAgentTransport } from "@ecp/runtime";
import {
  TraceCollector,
  ConsoleTraceExporter,
  JsonFileTraceExporter,
  formatTrace,
  renderGraph,
} from "@ecp/runtime";
import type { ExecutionTrace } from "@ecp/runtime";
import type { ECPContext, Orchestrator } from "@ecp/spec";

interface ParsedArgs {
  command: string;
  contextPath: string;
  inputs: Record<string, string | number | boolean>;
  debug: boolean;
  trace: boolean;
  traceDir: string;
  model?: string;
  provider: string;
  ollamaBaseUrl: string;
  toolServers: string;
  agentEndpoints: string;
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
  --ollama-base-url <url>    Ollama server URL (default: http://localhost:11434)
  --trace, -t                Enable tracing (saves to ./traces/<run_id>.json)
  --trace-dir <dir>          Directory for trace files (default: ./traces)
  --tool-servers <json>      JSON map of tool server configs
  --agent-endpoints <json>   JSON map of agent endpoints
  --debug, -d                Enable debug logging
  --help, -h                 Show this help message

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
      "ollama-base-url": { type: "string", default: "http://localhost:11434" },
      trace: { type: "boolean", short: "t", default: false },
      "trace-dir": { type: "string", default: "./traces" },
      debug: { type: "boolean", short: "d", default: false },
      help: { type: "boolean", short: "h", default: false },
      "tool-servers": { type: "string", default: "" },
      "agent-endpoints": { type: "string", default: "" },
    },
  });

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
    ollamaBaseUrl: (values["ollama-base-url"] as string) ?? "http://localhost:11434",
    toolServers: (values["tool-servers"] as string) ?? "",
    agentEndpoints: (values["agent-endpoints"] as string) ?? "",
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
  console.log(`\n  Running: ${args.contextPath}\n`);

  let modelProvider: ModelProvider;

  if (args.provider === "ollama") {
    modelProvider = new OllamaProvider({
      baseURL: args.ollamaBaseUrl,
      defaultModel: args.model,
    });
  } else {
    modelProvider = new OpenAIProvider({
      defaultModel: args.model,
    });
  }

  const toolInvoker = new MCPToolInvoker();
  const agentTransport = new A2AAgentTransport();

  const toolServers = args.toolServers
    ? JSON.parse(args.toolServers) as Record<string, { transport: Record<string, unknown> }>
    : undefined;

  const agentEndpoints = args.agentEndpoints
    ? JSON.parse(args.agentEndpoints) as Record<string, string>
    : undefined;

  const engine = new ECPEngine(modelProvider, toolInvoker, agentTransport, {
    toolServers,
    agentEndpoints,
    defaultModel: args.model,
    modelOverride: args.model,
    debug: args.debug,
    trace: args.trace,
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
    contextPath: args.contextPath,
    inputs: args.inputs,
  });

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

  console.log("\n--- Executor Outputs ---");
  for (const [name, output] of Object.entries(result.executorOutputs)) {
    console.log(`\n  [${name}]`);
    console.log(JSON.stringify(output, null, 2));
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
