import { Flags, Args } from "@oclif/core";
import { resolve } from "node:path";

import { loadContext, resolveInputs } from "@executioncontrolprotocol/runtime";
import type { ECPContext, Orchestrator } from "@executioncontrolprotocol/spec";

import { commandErrorMessage } from "../lib/command-helpers.js";
import { parseKeyValueInputs } from "../lib/parsing.js";
import { getRequiredInputNames } from "../lib/inputs.js";
import { EcpEnvironmentCommand } from "../lib/ecp-environment-command.js";

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

export default class Validate extends EcpEnvironmentCommand {
  static summary = "Validate a Context manifest";

  static flags = {
    ...EcpEnvironmentCommand.flags,
    input: Flags.string({
      char: "i",
      multiple: true,
      description: "Set an input value (repeatable, key=value)",
      summary: "Input value (key=value)",
    }),
    "skip-inputs": Flags.boolean({
      description:
        "Validate the Context manifest itself but skip runtime input resolution (prints required inputs instead).",
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
    const { args, flags } = await this.parse(Validate);
    this.applyEnvironmentFlag(flags);
    const contextPath = resolve(args.contextPath);

    console.log(`\nValidating: ${contextPath}\n`);

    let context: ECPContext | undefined;
    try {
      const inputs = parseKeyValueInputs(flags.input as string[] | undefined, "--input");
      context = loadContext(contextPath);
      if (!flags["skip-inputs"]) {
        resolveInputs(context, inputs);
      }

      const strategy = context.orchestration?.strategy ?? context.orchestrator?.strategy;
      const executionObjectNames = collectExecutionObjectNames(context);

      console.log(`  Context: ${context.metadata.name} v${context.metadata.version}`);
      console.log(`  Strategy: ${strategy ?? "unknown"}`);
      console.log(`  Execution objects: ${executionObjectNames.join(", ")}`);
      console.log(`  Schemas: ${Object.keys(context.schemas ?? {}).join(", ")}`);

      if (flags["skip-inputs"]) {
        const requiredInputs = getRequiredInputNames(context);
        if (requiredInputs.length > 0) {
          console.log(`\n  Required inputs (from Context): ${requiredInputs.join(", ")}`);
        } else {
          console.log(`\n  No required inputs declared in Context.`);
        }
      }
      console.log(`\n  Validation passed.\n`);
    } catch (err) {
      const msg = commandErrorMessage(err);
      const missing = msg.match(/^Missing required input: "([^"]+)"$/);
      if (missing && context) {
        const inputName = missing[1];
        this.error(
          `\n  Missing required input "${inputName}" is defined in the Context.\n` +
            `  Provide it via --input ${inputName}=<value> (e.g. -i ${inputName}="...").\n`,
          { exit: 1 },
        );
        return;
      }
      this.error(`\n  Validation failed: ${msg}\n`, { exit: 1 });
    }
  }
}

