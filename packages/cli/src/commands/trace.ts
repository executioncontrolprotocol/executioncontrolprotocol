import { Command, Flags, Args } from "@oclif/core";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { formatTrace, type ExecutionTrace } from "@executioncontrolprotocol/runtime";

export default class Trace extends Command {
  static summary = "Display execution trace";

  static flags = {
    "trace-dir": Flags.string({
      description: "Directory for trace files",
      default: "./traces",
    }),
  };

  static args = {
    runId: Args.string({
      required: true,
      description: "run id (e.g. run-123...)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Trace);
    const runId = args.runId;

    const traceDir = flags["trace-dir"];
    const filePath = resolve(traceDir, `${runId}.json`);

    if (!existsSync(filePath)) {
      this.error(
        `\n  Trace not found: ${filePath}\n  Run with --trace to generate: ecp run <context.yaml> --trace\n`,
        { exit: 1 },
      );
    }

    const trace = JSON.parse(readFileSync(filePath, "utf-8")) as ExecutionTrace;
    console.log(formatTrace(trace));
  }
}

