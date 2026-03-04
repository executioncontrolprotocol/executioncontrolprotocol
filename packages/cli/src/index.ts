#!/usr/bin/env tsx
/**
 * ECP CLI — run Context manifests from the command line.
 *
 * Usage:
 *   ecp run <context.yaml> [--input key=value ...] [--debug] [--model <model>]
 *   ecp validate <context.yaml>
 *
 * @category CLI
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { ECPEngine, loadContext, resolveInputs } from "@ecp/runtime";
import { OpenAIProvider } from "@ecp/runtime";
import { MCPToolInvoker } from "@ecp/runtime";
import { A2AAgentTransport } from "@ecp/runtime";

interface ParsedArgs {
  command: string;
  contextPath: string;
  inputs: Record<string, string | number | boolean>;
  debug: boolean;
  model?: string;
  toolServers: string;
  agentEndpoints: string;
}

function printUsage(): void {
  console.log(`
ECP CLI — Execution Control Protocol runner

Usage:
  ecp run <context.yaml>     Execute a Context manifest
  ecp validate <context.yaml> Validate a Context manifest

Options:
  --input, -i <key=value>    Set an input value (repeatable)
  --model, -m <model>        Override the default model (e.g. gpt-4o-mini)
  --tool-servers <json>      JSON map of tool server configs
  --agent-endpoints <json>   JSON map of agent endpoints
  --debug, -d                Enable debug logging
  --help, -h                 Show this help message

Examples:
  ecp run spec.yaml --input shopifyStoreId=store-123 --input jiraProject=OPS
  ecp validate spec.yaml
`);
}

function parseCliArgs(): ParsedArgs {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string", short: "i", multiple: true },
      model: { type: "string", short: "m" },
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
  const contextPath = positionals[1];

  if (!contextPath) {
    console.error("Error: context path is required");
    printUsage();
    process.exit(1);
  }

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
    contextPath: resolve(contextPath),
    inputs,
    debug: values.debug as boolean,
    model: values.model as string | undefined,
    toolServers: (values["tool-servers"] as string) ?? "",
    agentEndpoints: (values["agent-endpoints"] as string) ?? "",
  };
}

async function runValidate(args: ParsedArgs): Promise<void> {
  console.log(`\nValidating: ${args.contextPath}\n`);

  try {
    const context = loadContext(args.contextPath);
    resolveInputs(context, args.inputs);

    console.log(`  Context: ${context.metadata.name} v${context.metadata.version}`);
    console.log(`  Strategy: ${context.orchestration.strategy}`);
    console.log(`  Executors: ${context.executors.map((e) => e.name).join(", ")}`);
    console.log(`  Schemas: ${Object.keys(context.schemas ?? {}).join(", ")}`);
    console.log(`\n  Validation passed.\n`);
  } catch (err) {
    console.error(`\n  Validation failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

async function runExecute(args: ParsedArgs): Promise<void> {
  console.log(`\n  Running: ${args.contextPath}\n`);

  const modelProvider = new OpenAIProvider({
    defaultModel: args.model,
  });

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
    debug: args.debug,
  });

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
  console.log(`  Est. cost:  $${result.totalBudgetUsage.costUsd.toFixed(4)}`);

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

  console.log("");
  process.exit(result.success ? 0 : 1);
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
