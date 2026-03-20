import { Command, Flags, Args } from "@oclif/core";
import { resolve } from "node:path";

import { loadContext, resolveInputs } from "@executioncontrolprotocol/runtime";
import type { ECPContext, Orchestrator } from "@executioncontrolprotocol/spec";

import { parseKeyValueInputs } from "../lib/parsing.js";

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

export default class Validate extends Command {
  static summary = "Validate a Context manifest";

  static flags = {
    input: Flags.string({
      char: "i",
      multiple: true,
      description: "Set an input value (repeatable, key=value)",
      summary: "Input value (key=value)",
    }),
  };

  static args = {
    contextPath: Args.string({
      required: true,
      description: "Path to context.yaml (or context.json)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Validate);
    const contextPath = resolve(args.contextPath);

    console.log(`\nValidating: ${contextPath}\n`);

    try {
      const inputs = parseKeyValueInputs(flags.input as string[] | undefined, "--input");
      const context = loadContext(contextPath);
      resolveInputs(context, inputs);

      const strategy = context.orchestration?.strategy ?? context.orchestrator?.strategy;
      const executionObjectNames = collectExecutionObjectNames(context);

      console.log(`  Context: ${context.metadata.name} v${context.metadata.version}`);
      console.log(`  Strategy: ${strategy ?? "unknown"}`);
      console.log(`  Execution objects: ${executionObjectNames.join(", ")}`);
      console.log(`  Schemas: ${Object.keys(context.schemas ?? {}).join(", ")}`);
      console.log(`\n  Validation passed.\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(`\n  Validation failed: ${msg}\n`, { exit: 1 });
    }
  }
}

